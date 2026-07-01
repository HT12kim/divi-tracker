# AGENTS.md

## Operational Commands

```bash
npm run dev
npm run build
npm run preview
./node_modules/.bin/vite build
```

- `npm run dev` starts the Vite app and local API middleware.
- `npm run build` triggers npm's `prebuild` lifecycle first because `package.json` defines `prebuild`.
- Use `./node_modules/.bin/vite build` for frontend-only verification.
- `prebuild` requires `DART_API_KEY`; do not require production API keys for UI-only changes.

## Golden Rules

- Keep edits scoped to the requested surface. This app is intentionally a compact single-page dashboard.
- Preserve Korean copy, SEO metadata, structured data, Kakao sharing, and Netlify routing behavior unless the task explicitly targets them.
- Prefer existing React, Tailwind, lucide-react, and Recharts patterns over introducing new UI libraries.
- For frontend design work, improve the actual dashboard workflow first: search, watchlist, selected stock detail, ETF explorer, loading and empty states.
- Avoid decorative-only UI. Every visible element should help scanning, selection, comparison, or action.
- Keep cards and panels compact, with stable responsive sizing and no overlapping text.
- No emojis in new agent instructions or generated governance docs.

## Project Context

- Product: Korean-language dividend stock tracker for US and KR stocks and ETFs.
- Runtime: React 18, Vite, Tailwind CSS, lucide-react, Recharts.
- Deploy target: Netlify with `dist/` as the publish directory.
- Data model: frontend calls `/api/*`; local development proxies through Vite middleware, production redirects through Netlify Functions.
- Main UI file: `src/App.jsx`. It contains search, watchlist, stock detail, dividend timeline/table/chart, ETF holdings, CAPEX, ETF explorer, FAQ, and guide sections.
- Theme: class-based Tailwind dark mode, stored as `dm-theme` in `localStorage`.
- Cache invalidation: `CACHE_VERSION` in `src/App.jsx`.

## Standards & References

- Frontend rules: see `src/AGENTS.md`.
- API and function rules: see `netlify/functions/AGENTS.md`.
- Netlify routing: `netlify.toml`.
- Korean stock and ETF master files: `vite.config.csv`, `data_1131_*.csv`.
- Build-time DART helper: `scripts/build-corp-codes.js`; do not assume it is wired into `npm run build` without checking `package.json`.

## Context Map

- `src/AGENTS.md`: React/Tailwind dashboard constraints, component boundaries, visual standards, validation.
- `netlify/functions/AGENTS.md`: Netlify Function boundaries, shared utilities, data source handling, API response standards.
