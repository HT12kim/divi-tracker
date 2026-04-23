# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**배당의 민족 (Dividend Master)** – A Korean-language dividend stock tracker for US and KR markets. Deployed on Netlify at `https://divi-tracker.netlify.app`.

## Commands

```bash
npm run dev       # Vite dev server on localhost:5173 (also runs Yahoo Finance API proxy)
npm run build     # prebuild (downloads DART corp codes) + Vite build → dist/
npm run preview   # preview the production build
```

The `prebuild` step (`scripts/build-corp-codes.js`) requires `DART_API_KEY` env var set. It downloads `corpCode.xml` ZIP from DART and writes `netlify/functions/corp-codes.json`. Skip the real download in local dev if the env var is absent.

## Architecture

### Data flow

- **Dev**: Vite dev server in `vite.config.js` acts as a middleware proxy, calling `yahoo-finance2` npm package directly. Routes: `/api/quote`, `/api/search`, `/api/dividends`, `/api/kr-stocks`, `/api/kr-etfs`.
- **Prod**: All `/api/*` requests redirect to `/.netlify/functions/:splat` (see `netlify.toml`). Each function is a standalone file in `netlify/functions/`.

### Frontend

Everything lives in a single component file `src/App.jsx` (~3100 lines). Key sections:

| Component | Lines | Purpose |
|---|---|---|
| `DashboardApp` | ~2240 | Root state manager: data fetching, routing between main view and ETF Explorer |
| `SearchBar` | ~148 | Debounced search: merges local CSV results (KR stocks) + Yahoo Finance suggestions |
| `WatchlistPanel` | ~487 | Persisted watchlist in localStorage |
| `StockDetailView` | ~1906 | Assembles detail cards for a selected stock |
| `StockInfoHeader` | ~625 | Price, yield, metrics chips |
| `DividendTimeline` | ~778 | Month-by-month ex-date/pay-date calendar visualization |
| `DividendTable` | ~926 | Historical dividend table |
| `DpsBarChart` | ~1054 | Year-over-year DPS line chart |
| `EtpHoldingsContainer` | ~1550 | ETF holdings bar chart (SPDR, iShares, etc.) |
| `CapexContainer` | ~1734 | Korean CAPEX chart + table (DART + SEC EDGAR data) |
| `EtfExplorerPage` | ~1927 | Full-page ETF explorer (ARKK, BRK-B holdings + trades) |

Theme: Tailwind dark mode toggled via `document.documentElement.classList`. Stored in `localStorage` as `dm-theme`. Default: dark.

Cache invalidation: `CACHE_VERSION = 5` in App.jsx. Bump this constant to purge all localStorage caches.

### Netlify Functions (`netlify/functions/`)

| File | Endpoint | Data source |
|---|---|---|
| `quote.js` | `/api/quote?symbol=` | Yahoo Finance `quoteSummary` + `quote` |
| `search.js` | `/api/search?q=` | Yahoo Finance `search` |
| `dividends.js` | `/api/dividends?symbol=` | Yahoo Finance `historical` (events=dividends) |
| `kr-stocks.js` | `/api/kr-stocks` | `vite.config.csv` (KRX stock list, EUC-KR encoded) |
| `kr-etfs.js` | `/api/kr-etfs` | `data_1131_*.csv` (KRX ETF list, EUC-KR encoded) |
| `holdings.js` | `/api/holdings?symbol=` | Yahoo Finance fund holdings |
| `capex.js` | `/api/capex?symbol=` | DART API (KR stocks via `corp-codes.json`) + SEC EDGAR (US stocks) |
| `ksd-dividends.js` | `/api/ksd-dividends` | KSD Seibro API (Korean dividend schedule) |
| `etf-explorer.js` | `/api/etf-explorer?fund=` | ARK CSV + Yahoo Finance (ARKK); Yahoo Finance (BRK-B) |

The `netlify/functions/utils/` directory contains shared utilities (`csv.js`, `fetch-with-timeout.js`).

### Korean Stock Data

- `vite.config.csv` – KRX stock master (columns: idx, code, name, shortName, engName, …, market). EUC-KR encoded.
- `data_1131_*.csv` – KRX ETF master. The functions pick the lexicographically last matching file. EUC-KR encoded.
- Both files are bundled into Netlify Functions via `included_files` in `netlify.toml`.

### Build artifact

`netlify/functions/corp-codes.json` maps `stockCode → corpCode` for all KRX-listed companies. Generated at build time by `scripts/build-corp-codes.js`. Required by `capex.js` at runtime.

## Environment Variables

| Variable | Used by | Notes |
|---|---|---|
| `DART_API_KEY` | `scripts/build-corp-codes.js`, `netlify/functions/capex.js` | DART OpenAPI key |
| `KSD_SERVICE_KEY` | `netlify/functions/ksd-dividends.js` | KSD Seibro API key |

Set these in Netlify environment settings for production, and in `.env` (gitignored) for local dev.

## Deployment

Deploy target is Netlify. `netlify.toml` configures build command, publish dir (`dist`), function bundler (`esbuild`), edge function (`og-inject` for OG meta injection), and cache headers.
