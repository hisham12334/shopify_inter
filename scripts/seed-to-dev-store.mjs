#!/usr/bin/env node
/*
 * Seed your Shopify dev store from the public xinzuo.com.au catalog snapshot.
 *
 * Default: SLIM (40 products, 5 articles, all collections, all pages) — ~90 seconds.
 * Full catalog opt-in: --full (237 products, 77 articles) — ~8 minutes.
 *
 * Usage:
 *   node scripts/seed-to-dev-store.mjs                # dry-run, slim
 *   node scripts/seed-to-dev-store.mjs --write        # write slim seed (default)
 *   node scripts/seed-to-dev-store.mjs --write --full # full catalog
 *   node scripts/seed-to-dev-store.mjs --wipe         # delete existing dev-store products first
 *   node scripts/seed-to-dev-store.mjs --write --wipe # wipe + write slim seed
 *
 * Reads .env: SHOPIFY_STORE_URL=*.myshopify.com, SHOPIFY_ACCESS_TOKEN=shpat_…
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const FULL = process.argv.includes('--full');
const WIPE = process.argv.includes('--wipe');

const SLIM_PRODUCTS = 40;
const SLIM_ARTICLES = 5;
const CONCURRENCY = 4;

const envPath = path.join(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.error(`No .env in ${process.cwd()}. See README.`);
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const STORE = env.SHOPIFY_STORE_URL;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
if (!STORE || !TOKEN) { console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN'); process.exit(1); }

const hostname = STORE.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
if (!hostname.endsWith('.myshopify.com')) {
  console.error(`REFUSED: store URL must end in *.myshopify.com. Got: ${hostname}`);
  console.error(`(Use the *.myshopify.com URL, not a custom domain.)`);
  process.exit(1);
}
if (/^xinzuo\.com\.au$/i.test(hostname)) { console.error('REFUSED: production custom domain'); process.exit(1); }

const BASE = `https://${hostname}`;
const API = `${BASE}/admin/api/2024-10`;

// --- HTTP with rate-limit handling ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, endpoint, body) {
  while (true) {
    const r = await fetch(`${API}/${endpoint}`, {
      method,
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) {
      const wait = parseFloat(r.headers.get('retry-after') || '2') * 1000;
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error(`${method} ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

async function paginate(endpoint) {
  let next = `${API}/${endpoint}?limit=250`;
  const out = [];
  while (next) {
    const r = await fetch(next, { headers: { 'X-Shopify-Access-Token': TOKEN } });
    if (!r.ok) throw new Error(`${endpoint} ${r.status}`);
    const data = await r.json();
    const key = Object.keys(data)[0];
    out.push(...(data[key] ?? []));
    const m = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

// --- Concurrency pool ---
async function pool(items, worker, concurrency = CONCURRENCY) {
  let idx = 0;
  let ok = 0, fail = 0;
  let lastLog = Date.now();
  const total = items.length;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (idx < items.length) {
        const i = idx++;
        try { await worker(items[i], i); ok++; } catch { fail++; }
        if (Date.now() - lastLog > 2000) {
          console.log(`  ${ok + fail}/${total} (${ok} ok, ${fail} failed)`);
          lastLog = Date.now();
        }
      }
    }),
  );
  return { ok, fail };
}

// --- Load seed ---
const seedPath = path.join(process.cwd(), 'seed.json');
if (!existsSync(seedPath)) { console.error('No seed.json in CWD'); process.exit(1); }
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));

const productsToCreate = FULL ? seed.products : seed.products.slice(0, SLIM_PRODUCTS);
const articlesToCreate = FULL ? seed.articles : seed.articles.slice(0, SLIM_ARTICLES);

console.log(`\n${WRITE ? '✓ WRITE' : 'DRY-RUN'} → ${hostname}`);
console.log(`Mode: ${FULL ? 'FULL' : 'SLIM'}`);
console.log(`Plan: ${productsToCreate.length} products + ${seed.collections.length} collections + ${seed.pages.length} pages + ${articlesToCreate.length} articles`);
console.log(`Concurrency: ${CONCURRENCY}`);
if (WIPE) console.log(`Will WIPE existing products/collections/pages/articles first.`);
if (!WRITE) console.log(`\n(Pass --write to actually create.)\n`);

const startedAt = Date.now();

if (WRITE && WIPE) {
  console.log('\n=== WIPE: deleting existing dev-store content ===');
  const existing = {
    products: await paginate('products.json?fields=id'),
    custom: await paginate('custom_collections.json?fields=id'),
    smart: await paginate('smart_collections.json?fields=id'),
    pages: await paginate('pages.json?fields=id'),
    articles: await paginate('articles.json?fields=id,blog_id'),
    blogs: await paginate('blogs.json?fields=id,handle'),
  };
  await pool(existing.products, (p) => api('DELETE', `products/${p.id}.json`));
  console.log(`  deleted ${existing.products.length} products`);
  await pool(existing.custom, (c) => api('DELETE', `custom_collections/${c.id}.json`));
  await pool(existing.smart, (c) => api('DELETE', `smart_collections/${c.id}.json`));
  console.log(`  deleted ${existing.custom.length + existing.smart.length} collections`);
  await pool(existing.pages, (p) => api('DELETE', `pages/${p.id}.json`));
  console.log(`  deleted ${existing.pages.length} pages`);
  for (const a of existing.articles) {
    try { await api('DELETE', `blogs/${a.blog_id}/articles/${a.id}.json`); } catch {}
  }
  console.log(`  deleted ${existing.articles.length} articles`);
}

const created = { products: 0, collections: 0, pages: 0, blogs: 0, articles: 0 };

// --- PRODUCTS (parallel) ---
console.log(`\n=== Products (${productsToCreate.length}) ===`);
if (WRITE) {
  const res = await pool(productsToCreate, async (p) => {
    await api('POST', 'products.json', {
      product: {
        title: p.title, body_html: p.body_html, handle: p.handle,
        product_type: p.product_type, vendor: p.vendor, tags: p.tags,
        options: p.options, images: p.images, variants: p.variants,
      },
    });
  });
  created.products = res.ok;
  console.log(`  ${res.ok} created, ${res.fail} failed`);
} else created.products = productsToCreate.length;

// --- COLLECTIONS (parallel) ---
console.log(`\n=== Collections (${seed.collections.length}) ===`);
if (WRITE) {
  const res = await pool(seed.collections, async (c) => {
    const endpoint = c.type === 'smart' ? 'smart_collections.json' : 'custom_collections.json';
    const key = c.type === 'smart' ? 'smart_collection' : 'custom_collection';
    const body = c.type === 'smart'
      ? { [key]: { title: c.title, handle: c.handle, body_html: c.body_html, sort_order: c.sort_order, image: c.image, disjunctive: c.disjunctive, rules: c.rules } }
      : { [key]: { title: c.title, handle: c.handle, body_html: c.body_html, sort_order: c.sort_order, image: c.image } };
    await api('POST', endpoint, body);
  });
  created.collections = res.ok;
  console.log(`  ${res.ok} created, ${res.fail} failed`);
} else created.collections = seed.collections.length;

// --- PAGES (parallel) ---
console.log(`\n=== Pages (${seed.pages.length}) ===`);
if (WRITE) {
  const res = await pool(seed.pages, async (p) => {
    await api('POST', 'pages.json', { page: { title: p.title, handle: p.handle, body_html: p.body_html, published: true } });
  });
  created.pages = res.ok;
  console.log(`  ${res.ok} created, ${res.fail} failed`);
} else created.pages = seed.pages.length;

// --- BLOGS + ARTICLES ---
console.log(`\n=== Blogs + Articles (${articlesToCreate.length}) ===`);
const blogHandleToId = new Map();
if (WRITE) {
  for (const b of seed.blogs) {
    try {
      const resp = await api('POST', 'blogs.json', { blog: { title: b.title, handle: b.handle } });
      blogHandleToId.set(b.handle, resp.blog.id);
      created.blogs++;
    } catch {}
  }
  // Default blog fallback
  if (!blogHandleToId.size) {
    const resp = await api('POST', 'blogs.json', { blog: { title: 'News', handle: 'news' } });
    blogHandleToId.set('news', resp.blog.id);
    created.blogs++;
  }
  const fallback = [...blogHandleToId.values()][0];
  const res = await pool(articlesToCreate, async (a) => {
    const blogId = blogHandleToId.get(a.blog_handle) ?? fallback;
    await api('POST', `blogs/${blogId}/articles.json`, {
      article: { title: a.title, handle: a.handle, body_html: a.body_html, tags: a.tags, image: a.image, published: true },
    });
  });
  created.articles = res.ok;
  console.log(`  ${res.ok} created, ${res.fail} failed`);
} else { created.blogs = seed.blogs.length; created.articles = articlesToCreate.length; }

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`\n=== Summary (${elapsed}s) ===`);
console.log(JSON.stringify(created, null, 2));
console.log(`\n${WRITE ? '✓ Done.' : 'DRY RUN — pass --write to create.'}`);
if (WRITE) {
  console.log(`\nNext: push the Liquid theme:`);
  console.log(`  node scripts/push-theme.mjs --write`);
}
