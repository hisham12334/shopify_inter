#!/usr/bin/env node
/*
 * One-shot setup: seed dev store + push theme + publish.
 *
 * Usage:
 *   node scripts/setup.mjs              # dry-run preview
 *   node scripts/setup.mjs --write      # do the thing (slim, ~3 min total)
 *   node scripts/setup.mjs --write --full   # full catalog (~10 min)
 *   node scripts/setup.mjs --write --wipe   # wipe + re-seed
 *
 * Requires .env with SHOPIFY_STORE_URL + SHOPIFY_ACCESS_TOKEN.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const startedAt = Date.now();
const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const args = process.argv.slice(2);

function step(name, script, extraArgs = []) {
  console.log(`\n━━━ ${name} ━━━`);
  const stepStart = Date.now();
  const r = spawnSync('node', [path.join(scriptDir, script), ...args, ...extraArgs], { stdio: 'inherit' });
  const stepElapsed = Math.round((Date.now() - stepStart) / 1000);
  if (r.status !== 0) {
    console.error(`\n✗ ${name} failed after ${stepElapsed}s. Aborting.`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ ${name} took ${stepElapsed}s`);
}

step('1/2 Seed dev store', 'seed-to-dev-store.mjs');
step('2/2 Push theme', 'push-theme.mjs');

const total = Math.round((Date.now() - startedAt) / 1000);
console.log(`\n━━━ TOTAL: ${total}s (${(total / 60).toFixed(1)} min) ━━━`);
console.log('You can now visit your dev store and pick the ONE thing to fix.');
