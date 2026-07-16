# DQXDAO English Product Catalog

Astro static product catalog for `www.fooddqxdao.com`.

## Data source

The site loads published products during the build from the existing RuoYi App API:

- `/app-api/product/category/list`
- `/app-api/product/spu/page`
- `/app-api/product/spu/get-detail`

Requests use tenant ID `163` by default. Build environment variables can override all site settings; see `.env.example`.

## Commands

```sh
npm install
npm run check
npm run build
npm run preview
```

The static output is generated in `dist`.

## Cloudflare

The repository can be connected directly to Cloudflare Workers Builds or Cloudflare Pages:

```text
Build command: npm run build
Output directory: dist
```

For Workers Static Assets, `wrangler.jsonc` is included and deployment can be verified with:

```sh
npm run deploy
```
