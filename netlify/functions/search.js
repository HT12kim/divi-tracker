import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const handler = async (event) => {
    try {
        const q = event.queryStringParameters?.q;
        if (!q) {
            return { statusCode: 400, body: JSON.stringify({ error: 'q required' }) };
        }
        const region = event.queryStringParameters?.region || 'KR';
        const lang = event.queryStringParameters?.lang || 'ko-KR';
        const data = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0, region, lang });
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
