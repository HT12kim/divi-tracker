/**
 * 10년 MDD(최대낙폭) 일괄 조회
 * GET /api/mdd?tickers=TSLA,ROKU,AAPL&years=10
 * Returns: { TSLA: -82.4, ROKU: -91.0, ... }
 */
import YahooFinance from 'yahoo-finance2';

const yahoo = new YahooFinance();

const calcMdd = async (ticker, years) => {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - years);
    const data = await yahoo.historical(
        ticker,
        {
            period1: period1.toISOString().slice(0, 10),
            period2: new Date().toISOString().slice(0, 10),
            interval: '1mo',
        },
        { validateResult: false },
    );
    if (!data?.length) return null;

    let peak = -Infinity;
    let maxDrawdown = 0;
    for (const bar of data) {
        const price = bar.adjClose ?? bar.close;
        if (!price || price <= 0) continue;
        if (price > peak) peak = price;
        const dd = (price - peak) / peak * 100;
        if (dd < maxDrawdown) maxDrawdown = dd;
    }
    return maxDrawdown === 0 ? null : parseFloat(maxDrawdown.toFixed(1));
};

export const handler = async (event) => {
    const params = event.queryStringParameters || {};
    const rawTickers = (params.tickers || '').trim();
    const years = Math.min(20, Math.max(1, parseInt(params.years || '10', 10)));
    const tickers = rawTickers
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 20);

    if (!tickers.length) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'tickers required' }),
        };
    }

    const TIMEOUT_MS = 9000;
    const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('MDD timeout')), TIMEOUT_MS),
    );

    const work = async () => {
        const result = {};
        // Process all chunks in parallel (5 per chunk to avoid rate-limiting)
        const chunks = [];
        for (let i = 0; i < tickers.length; i += 5) chunks.push(tickers.slice(i, i + 5));

        await Promise.allSettled(
            chunks.map((chunk) =>
                Promise.allSettled(
                    chunk.map(async (ticker) => {
                        try {
                            result[ticker] = await calcMdd(ticker, years);
                        } catch (_) {
                            result[ticker] = null;
                        }
                    }),
                ),
            ),
        );
        return result;
    };

    try {
        const data = await Promise.race([work(), timeoutPromise]);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400',
            },
            body: JSON.stringify(data),
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
