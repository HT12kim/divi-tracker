const TIMEOUT_MS = 6000;

const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
};

const SOURCES = [
    {
        name: 'Naver',
        url: 'https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=USD&u4=KRW&u8=down&u2=1',
        extract: (data) => ({
            rate: String(data?.country?.[1]?.value || '').replace(/,/g, ''),
            sourceUpdatedAt: null,
        }),
    },
    {
        name: 'open.er-api.com',
        url: 'https://open.er-api.com/v6/latest/USD',
        extract: (data) => ({
            rate: data?.rates?.KRW,
            sourceUpdatedAt: data?.time_last_update_utc || null,
        }),
    },
    {
        name: 'Frankfurter',
        url: 'https://api.frankfurter.app/latest?from=USD&to=KRW',
        extract: (data) => ({
            rate: data?.rates?.KRW,
            sourceUpdatedAt: data?.date || null,
        }),
    },
    {
        name: 'exchangerate.host',
        url: 'https://api.exchangerate.host/latest?base=USD&symbols=KRW',
        extract: (data) => ({
            rate: data?.rates?.KRW,
            sourceUpdatedAt: data?.date || null,
        }),
    },
];

export const getUsdKrwRate = async () => {
    const errors = [];

    for (const source of SOURCES) {
        try {
            const data = await fetchJson(source.url);
            const parsed = source.extract(data);
            const rate = Number(parsed.rate);
            if (Number.isFinite(rate) && rate > 0) {
                return {
                    base: 'USD',
                    quote: 'KRW',
                    rate,
                    source: source.name,
                    sourceUpdatedAt: parsed.sourceUpdatedAt,
                    fetchedAt: new Date().toISOString(),
                };
            }
            errors.push(`${source.name}: invalid rate`);
        } catch (err) {
            errors.push(`${source.name}: ${err.message || 'fetch failed'}`);
        }
    }

    const error = new Error('exchange rate fetch failed');
    error.details = errors;
    throw error;
};

export const handler = async () => {
    try {
        const result = await getUsdKrwRate();
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, max-age=0',
            },
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 502,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, max-age=0',
            },
            body: JSON.stringify({
                error: err.message || 'exchange rate fetch failed',
                details: err.details || [],
            }),
        };
    }
};
