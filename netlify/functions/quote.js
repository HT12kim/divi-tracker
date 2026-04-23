import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const TIMEOUT_MS = 8000;

const withTimeout = (promise, ms) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), ms);
    return promise.finally(() => clearTimeout(timer));
};

export const handler = async (event) => {
    try {
        const symbol = event.queryStringParameters?.symbol;
        if (!symbol) {
            return { statusCode: 400, body: JSON.stringify({ error: 'symbol required' }) };
        }

        let result;
        try {
            const summary = await withTimeout(
                yahooFinance.quoteSummary(
                    symbol,
                    { modules: ['price', 'summaryDetail'] },
                    { validateResult: false },
                ),
                TIMEOUT_MS,
            );
            result = {
                ...(summary.price ?? {}),
                _summaryDetail: summary.summaryDetail ?? {},
            };
        } catch (_) {
            result = await withTimeout(yahooFinance.quote(symbol), TIMEOUT_MS);
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message || 'server error' }),
        };
    }
};
