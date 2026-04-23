import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const TIMEOUT_MS = 8000;

export const handler = async (event) => {
    try {
        const q = (event.queryStringParameters?.q || '').trim();
        if (!q) {
            return { statusCode: 400, body: JSON.stringify({ error: 'q required' }) };
        }
        if (q.length > 100) {
            return { statusCode: 400, body: JSON.stringify({ error: 'q too long (max 100)' }) };
        }
        const region = event.queryStringParameters?.region || 'KR';
        const lang = event.queryStringParameters?.lang || 'ko-KR';

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Search timeout')), TIMEOUT_MS),
        );
        const data = await Promise.race([
            yahooFinance.search(q, { quotesCount: 10, newsCount: 0, region, lang }),
            timeoutPromise,
        ]);
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
