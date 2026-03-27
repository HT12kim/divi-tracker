import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import YahooFinance from 'yahoo-finance2';

// yahoo-finance2 v3+ exposes a class; create a single instance for reuse.
const yahooFinance = new YahooFinance();

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'yahoo-finance-proxy',
            configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                    try {
                        if (!req.url) return next();
                        const url = new URL(req.url, 'http://localhost');
                        const send = (code, payload) => {
                            res.statusCode = code;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify(payload));
                        };

                        if (url.pathname === '/api/quote') {
                            const symbol = url.searchParams.get('symbol');
                            if (!symbol) return send(400, { error: 'symbol required' });
                            let result;
                            try {
                                const summary = await yahooFinance.quoteSummary(
                                    symbol,
                                    {
                                        modules: ['price', 'summaryDetail'],
                                    },
                                    { validateResult: false },
                                );
                                result = {
                                    ...(summary.price ?? {}),
                                    _summaryDetail: summary.summaryDetail ?? {},
                                };
                            } catch (_) {
                                // fallback to basic quote
                                result = await yahooFinance.quote(symbol);
                            }
                            return send(200, result);
                        }

                        if (url.pathname === '/api/search') {
                            const q = url.searchParams.get('q');
                            if (!q) return send(400, { error: 'q required' });
                            const data = await yahooFinance.search(q, { quotesCount: 6, newsCount: 0 });
                            return send(200, data);
                        }

                        if (url.pathname === '/api/dividends') {
                            const symbol = url.searchParams.get('symbol');
                            if (!symbol) return send(400, { error: 'symbol required' });
                            const period1 = url.searchParams.get('from') || '2023-01-01';
                            const period2 = url.searchParams.get('to') || new Date().toISOString().slice(0, 10);
                            const data = await yahooFinance.historical(symbol, {
                                period1,
                                period2,
                                events: 'dividends',
                            });
                            return send(200, data);
                        }
                    } catch (err) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: err.message || 'server error' }));
                        return;
                    }

                    return next();
                });
            },
        },
    ],
});
