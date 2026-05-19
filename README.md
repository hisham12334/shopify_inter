# xinzuo.com.au Shopify clone — TYICDI hiring task

A sanitized clone of the [xinzuo.com.au](https://xinzuo.com.au) Shopify store, packaged so you can stand up a full visual mirror on your own free Shopify dev store in **about 4 minutes**.

You get the real Liquid theme + 40 sample products (covering all major collections) + 68 collections + 17 pages + 5 published articles, all imported via one command.

---

## Quick start — ~4 minutes from `git clone` to live dev store

### 1. Sign up for Shopify Partners (free, instant)

<https://www.shopify.com/partners/signup>

### 2. Create a development store

Partner dashboard → **Stores** → **Add store** → **Development store**. Pick any name. Won't be visible to customers, never billed.

### 3. Generate an Admin API token in your dev store

In your dev store admin:

1. **Settings → Apps and sales channels → Develop apps**
2. **Allow custom app development** (if prompted)
3. **Create an app** → name it anything (e.g. `xinzuo-seed`)
4. **Configure Admin API scopes** → tick **all of**:
   - `read_products`, `write_products`
   - `read_themes`, `write_themes`
   - `read_content`, `write_content`
5. **Save → Install app**
6. Copy the **Admin API access token** (starts with `shpat_…`) — you only see it once.

### 4. Clone this repo

```bash
git clone https://github.com/dintyo/xinzuo-theme-snapshot.git
cd xinzuo-theme-snapshot
```

### 5. Create `.env` in the repo root

```bash
SHOPIFY_STORE_URL=your-dev-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> The `.env` is gitignored — never commit your token.

### 6. Run setup (one command, ~4 min)

```bash
node scripts/setup.mjs --write
```

Measured timing on a fresh dev store:
- Seed data (40 products, 68 collections, 17 pages, 5 articles): **~80s**
- Theme push (584 files): **~140s**
- **Total: ~3.5–5 min**

### 7. Visit your dev store

Partner dashboard → click your store → **Online Store**. You're now looking at a working clone of xinzuo.com.au running on your own infrastructure.

---

## The hiring task

**Pick the ONE thing** on this store that you'd fix if you owned it. Anywhere — homepage, PDP, collection page, cart, mobile UX, navigation, blog, footer. Performance, SEO, conversion, accessibility, bug, copy, trust — your call.

**This is an engineering task, not a redesign.** We want the eye for what a real Shopify dev would catch.

Submit in your own public GitHub repo with **≥3 commits inside your 2-hour window**:

1. Your fix (edited Liquid/CSS/JS in original paths)
2. `before.png` — screenshot of the issue
3. `after.png` — screenshot of your fix
4. `NOTE.md`:
   ```markdown
   ## What I picked
   ## Why it's #1
   ## What I did
   ## What I'd do next
   ```
5. Loom URL (max 3 min, face + screen) in your repo's `README.md`

Submit your repo + Loom + NOTE on the [hiring portal](https://apply.toldyouicoulddoit.com).

---

## Setup script options

```bash
# Default — slim seed (40 products), takes ~4 min
node scripts/setup.mjs --write

# Full catalog — 237 products + 77 articles, takes ~10 min
node scripts/setup.mjs --write --full

# Wipe existing data and re-seed (e.g. if you want a clean slate)
node scripts/setup.mjs --write --wipe

# Dry-run preview (no changes, prints what would happen)
node scripts/setup.mjs
```

Individual steps if you want fine control:
```bash
node scripts/seed-to-dev-store.mjs --write    # data only
node scripts/push-theme.mjs --write           # theme only
```

---

## What's NOT in this repo (and why)

- `.env` / API tokens — never committed
- Customer data — never queried
- Order data — never queried
- Refunds, discount codes, webhooks, apps — never queried
- Variant `cost`, `inventory_quantity`, internal metafields — explicitly stripped by the export allowlist
- Internal tags (anything containing "supplier", "wholesale", "margin") — filtered
- References to xinzuo's Shopify-hosted video/image files that wouldn't exist in your dev store — automatically scrubbed at upload (replaced with empty values)

In short: only what you'd see by browsing xinzuo.com.au with DevTools open.

## License

Shared **solely for the TYICDI developer hiring task**. Brand, product names, content © Xinzuo Australia / Told You I Could Do It. Do not redistribute or fork for commercial use.
