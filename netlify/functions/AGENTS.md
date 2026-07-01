# AGENTS.md

## Module Context

- This directory contains standalone Netlify Functions that back `/api/*`.
- Shared helpers live in `netlify/functions/utils/`.
- Static bundled data includes `corp-codes.json`, `vite.config.csv`, and the lexicographically latest `data_1131_*.csv` configured through `netlify.toml`.

## Dependency Boundary

- Do not move frontend-only code into functions.
- Keep each function independently deployable under Netlify's function runtime.
- Use shared utilities for CSV parsing and fetch timeouts instead of duplicating parsing or timeout logic.
- Keep external data-source behavior explicit: Yahoo Finance, DART, KSD Seibro, ARK CSV, and SEC EDGAR have different failure modes.

## Local Golden Rules

- Return JSON for API-style endpoints unless an endpoint intentionally proxies XML or text.
- Preserve CORS and cache-related behavior when present.
- Do not log secrets or full API keys.
- Treat missing env vars as recoverable where possible; return clear error payloads rather than crashing the function.
- Keep Korean stock code normalization compatible with `.KS`, `.KQ`, and six-digit KRX inputs.

## Testing Strategy

- Prefer narrow function checks with local Vite middleware or direct endpoint calls through `npm run dev`.
- For pure JavaScript edits, run `npm run build` when `DART_API_KEY` is available; otherwise use focused endpoint checks.
- When changing CSV handling, test both Korean stock and Korean ETF lookups.
