import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const handler = async (event) => {
    try {
        const symbol = (event.queryStringParameters?.symbol || '').trim();
        if (!symbol) {
            return { statusCode: 400, body: JSON.stringify({ error: 'symbol required' }) };
        }
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        const period1 = event.queryStringParameters?.from || '1990-01-01';
        const period2 = event.queryStringParameters?.to || new Date().toISOString().slice(0, 10);
        if (!dateRe.test(period1) || !dateRe.test(period2)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invalid date format (YYYY-MM-DD)' }) };
        }
        const data = await yahooFinance.historical(symbol, { period1, period2, events: 'dividends' });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message || 'server error' }),
        };
    }
};
