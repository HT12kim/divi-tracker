import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

                        if (url.pathname === '/api/kr-stocks') {
                            const csvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vite.config.csv');
                            if (!fs.existsSync(csvPath)) return send(404, { error: 'CSV not found' });
                            const buf = fs.readFileSync(csvPath);
                            let text;
                            try {
                                text = new TextDecoder('euc-kr').decode(buf);
                            } catch (_) {
                                text = buf.toString('latin1');
                            }
                            const lines = text.split(/\r?\n/);
                            const items = [];
                            for (let li = 1; li < lines.length; li++) {
                                const line = lines[li].trim();
                                if (!line) continue;
                                const fields = [];
                                let inQ = false,
                                    cur = '';
                                for (let i = 0; i < line.length; i++) {
                                    const c = line[i];
                                    if (c === '"') {
                                        inQ = !inQ;
                                        continue;
                                    }
                                    if (c === ',' && !inQ) {
                                        fields.push(cur);
                                        cur = '';
                                        continue;
                                    }
                                    cur += c;
                                }
                                fields.push(cur);
                                const code = (fields[1] || '').trim();
                                if (!code || !/^\d{6}$/.test(code)) continue;
                                items.push({
                                    code,
                                    name: (fields[2] || '').trim(),
                                    shortName: (fields[3] || '').trim(),
                                    engName: (fields[4] || '').trim(),
                                    market: (fields[6] || '').trim(),
                                });
                            }
                            return send(200, items);
                        }

                        if (url.pathname === '/api/kr-etfs') {
                            const cwd = path.dirname(fileURLToPath(import.meta.url));
                            let etfCsvPath = null;
                            try {
                                const files = fs
                                    .readdirSync(cwd)
                                    .filter((f) => /^data_1131_.*\.csv$/.test(f))
                                    .sort();
                                if (files.length > 0) etfCsvPath = path.join(cwd, files[files.length - 1]);
                            } catch (_) {}
                            if (!etfCsvPath) return send(404, { error: 'ETF CSV not found' });
                            const buf = fs.readFileSync(etfCsvPath);
                            let text;
                            try {
                                text = new TextDecoder('euc-kr').decode(buf);
                            } catch (_) {
                                text = buf.toString('latin1');
                            }
                            const lines = text.split(/\r?\n/);
                            const items = [];
                            for (let li = 1; li < lines.length; li++) {
                                const line = lines[li].trim();
                                if (!line) continue;
                                const fields = [];
                                let inQ = false,
                                    cur = '';
                                for (let i = 0; i < line.length; i++) {
                                    const c = line[i];
                                    if (c === '"') {
                                        inQ = !inQ;
                                        continue;
                                    }
                                    if (c === ',' && !inQ) {
                                        fields.push(cur);
                                        cur = '';
                                        continue;
                                    }
                                    cur += c;
                                }
                                fields.push(cur);
                                const code = (fields[1] || '').trim();
                                if (!code || !/^[A-Z0-9]{6}$/i.test(code)) continue;
                                items.push({
                                    code: code.toUpperCase(),
                                    name: (fields[2] || '').trim(),
                                    shortName: (fields[3] || '').trim(),
                                    engName: (fields[4] || '').trim(),
                                    market: (fields[10] || '').trim(),
                                    assetType: (fields[11] || '').trim(),
                                    type: 'ETF',
                                });
                            }
                            return send(200, items);
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
