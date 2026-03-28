import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const handler = async (event) => {
    try {
        const symbol = event.queryStringParameters?.symbol;
        if (!symbol) {
            return { statusCode: 400, body: JSON.stringify({ error: 'symbol required' }) };
        }

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
            result = await yahooFinance.quote(symbol);
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
