import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const handler = async (event) => {
    try {
        const symbol = event.queryStringParameters?.symbol;
        if (!symbol) {
            return { statusCode: 400, body: JSON.stringify({ error: 'symbol required' }) };
        }
        const period1 = event.queryStringParameters?.from || '2023-01-01';
        const period2 = event.queryStringParameters?.to || new Date().toISOString().slice(0, 10);
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
