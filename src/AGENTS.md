# AGENTS.md

## Module Context

- `src/App.jsx` is the primary app surface. It is a large single-file React dashboard, so keep changes surgical and easy to review.
- `src/index.css` is the right place for shared visual tokens and Tailwind component classes when repeated class strings become noisy.
- `src/main.jsx` should remain a thin React mount unless app bootstrapping changes.

## Framework Boundary

- Use React function components and hooks only.
- Use Tailwind utility classes and local `@layer` classes; do not add a component library.
- Use `lucide-react` for icons when an icon already exists.
- Use Recharts for chart changes; do not hand-roll chart rendering.

## Design Constraints

- The first screen is the tool itself, not a marketing landing page.
- Optimize for scan density: search, watchlist state, dividend metrics, timeline, and tables must remain visible and efficient.
- Keep cards at `rounded-lg` or smaller unless the element is a badge, avatar, or circular chart.
- Avoid decorative blobs, orbs, and background-only shapes.
- Do not add visible instructional text about how the UI was designed.
- Korean text must fit on mobile and desktop. Use wrapping, `min-w-0`, truncation, or smaller local labels where needed.
- Maintain dark-mode parity for every new visual state.

## Local Golden Rules

- Do not reset `CACHE_VERSION` unless cache shape changes.
- Preserve localStorage keys: `dm-theme`, `dm-watchlist`, `dm-live-cache`, `dm-cache-v`.
- Preserve existing fetch cancellation patterns for search and stock loading.
- Keep API paths relative (`/api/...`) so Vite and Netlify environments both work.
- Keep SEO and structured data behavior intact when editing rendered text around FAQ or stock detail pages.

## Testing Strategy

- Run `npm run build` when `DART_API_KEY` is available.
- For frontend-only verification, use `./node_modules/.bin/vite build`.
- Start `npm run dev -- --host 127.0.0.1` when visual inspection is needed.
- Check mobile-width behavior when editing header, search, cards, tables, or ETF explorer controls.
