#!/usr/bin/env node
/*
 * Push the Liquid theme to your dev store via Admin REST Asset API.
 *
 * Usage:
 *   node scripts/push-theme.mjs              # dry-run (lists files, doesn't upload)
 *   node scripts/push-theme.mjs --write      # upload + publish theme
 *
 * Uses 4-way concurrency. Total time: ~90 seconds for the full theme.
 *
 * Reads .env: SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN.
 * The token needs `read_themes, write_themes` scope.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const CONCURRENCY = 4;

const envPath = path.join(process.cwd(), '.env');
if (!existsSync(envPath)) { console.error('No .env in CWD'); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const STORE = env.SHOPIFY_STORE_URL;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN'); process.exit(1); }

const hostname = STORE.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!hostname.endsWith('.myshopify.com')) { console.error('REFUSED: not *.myshopify.com'); process.exit(1); }
if (/^xinzuo\.com\.au$/i.test(hostname)) { console.error('REFUSED: production custom domain'); process.exit(1); }

const BASE = `https://${hostname}`;
const API = `${BASE}/admin/api/2024-10`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, endpoint, body) {
  while (true) {
    const r = await fetch(`${API}/${endpoint}`, {
      method,
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) {
      await sleep(parseFloat(r.headers.get('retry-after') || '2') * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`${method} ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

const THEME_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const TEXT_EXTS = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.txt', '.md', '.scss']);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Upload in dependency order: leaf files first, then files that reference them.
// Phase 1: assets, blocks, snippets, sections (the building blocks)
// Phase 2: layout, config, locales (consume phase 1 sections)
// Phase 3: templates (consume sections defined in phase 1, layouts in phase 2)
const PHASE_ORDER = {
  assets: 1, blocks: 1, snippets: 1, sections: 1,
  layout: 2, config: 2, locales: 2,
  templates: 3,
};

const files = [];
for (const d of THEME_DIRS) {
  for (const full of walk(d)) {
    const rel = full.replace(/\\/g, '/');
    const ext = path.extname(rel).toLowerCase();
    const top = rel.split('/')[0];
    files.push({ key: rel, full, isText: TEXT_EXTS.has(ext), phase: PHASE_ORDER[top] ?? 99 });
  }
}
files.sort((a, b) => a.phase - b.phase);
console.log(`Theme: ${files.length} files (3 dependency phases)`);

if (!WRITE) {
  const byDir = {};
  for (const f of files) { const top = f.key.split('/')[0]; byDir[top] = (byDir[top] ?? 0) + 1; }
  console.log('By directory:', byDir);
  console.log(`\nDRY RUN — pass --write to upload to ${hostname}`);
  process.exit(0);
}

// --- Create theme ---
const startedAt = Date.now();
console.log(`Creating theme on ${hostname}...`);
const themeName = `xinzuo-clone-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const created = await api('POST', 'themes.json', { theme: { name: themeName, role: 'unpublished' } });
const themeId = created.theme.id;
console.log(`Theme id=${themeId} name=${themeName}`);

// --- Phased concurrent upload ---
// Strip references to media files that exist in xinzuo's Shopify Files
// but won't exist on the applicant's fresh dev store.
// Theme JSON templates often contain `"video": "shopify://shop_files/12345"` which
// Shopify rejects at upload if the file doesn't exist. Set those to empty strings.
function scrubShopFileRefs(text) {
  // Strip any shopify:// references in JSON config — they point at files in xinzuo's
  // Shopify Files that don't exist on the applicant's fresh dev store, and Shopify
  // rejects them at upload. JSON encodes / as \/ so we match both forms.
  // Covers shopify://files/..., shopify://shop_files/..., shopify://shop_images/...
  return text
    .replace(/"shopify:(?:\\\/|\/)(?:\\\/|\/)(?:shop_files|shop_images|files)(?:\\\/|\/)[^"]+"/g, '""');
}

async function uploadFile(f) {
  const buf = readFileSync(f.full);
  let value;
  if (f.isText) {
    value = buf.toString('utf-8');
    // Scrub only JSON files (template configs); leave Liquid/CSS/JS unchanged
    if (f.key.endsWith('.json')) value = scrubShopFileRefs(value);
  }
  const asset = f.isText
    ? { key: f.key, value }
    : { key: f.key, attachment: buf.toString('base64') };
  await api('PUT', `themes/${themeId}/assets.json`, { asset });
}

let ok = 0;
const failedFiles = [];
let lastLog = Date.now();

for (const phase of [1, 2, 3, 99]) {
  const batch = files.filter((f) => f.phase === phase);
  if (!batch.length) continue;
  console.log(`  phase ${phase}: ${batch.length} files`);
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (idx < batch.length) {
        const f = batch[idx++];
        try { await uploadFile(f); ok++; } catch (e) { failedFiles.push({ f, err: e.message }); }
        if (Date.now() - lastLog > 2000) {
          console.log(`    ${ok + failedFiles.length}/${files.length} (${ok} ok, ${failedFiles.length} failed)`);
          lastLog = Date.now();
        }
      }
    }),
  );
}

// Retry pass — by now all dependencies are in place
if (failedFiles.length) {
  console.log(`  retrying ${failedFiles.length} failed files…`);
  const retry = [...failedFiles];
  failedFiles.length = 0;
  for (const item of retry) {
    try { await uploadFile(item.f); ok++; }
    catch (e) { failedFiles.push({ f: item.f, err: e.message }); }
  }
}

if (failedFiles.length) {
  console.log(`  ${failedFiles.length} files still failing after retry:`);
  for (const { f, err } of failedFiles.slice(0, 5)) {
    console.log(`    [fail] ${f.key}: ${err.slice(0, 120)}`);
  }
}
console.log(`  ${ok}/${files.length} uploaded (${failedFiles.length} hard failures)`);

// --- Publish ---
console.log('Publishing theme...');
await api('PUT', `themes/${themeId}.json`, { theme: { id: themeId, role: 'main' } });

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`\n✓ Theme pushed and published in ${elapsed}s.`);
console.log(`Visit your store: ${BASE}`);
