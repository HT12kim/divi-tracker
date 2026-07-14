const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';
const TIMEOUT_MS = Number(process.env.API_CHECK_TIMEOUT_MS || 12000);

const checks = [
    {
        name: 'quote',
        path: '/api/quote?symbol=SCHD',
        validate: (json) => Boolean(json && (json.symbol || json.shortName || json.regularMarketPrice != null)),
    },
    {
        name: 'dividends',
        path: '/api/dividends?symbol=SCHD&from=2024-01-01',
        validate: (json) => Array.isArray(json),
    },
    {
        name: 'kr-etfs',
        path: '/api/kr-etfs',
        validate: (json) =>
            Array.isArray(json) &&
            json.some((item) => item.code && item.name && Object.prototype.hasOwnProperty.call(item, 'taxType')),
    },
    {
        name: 'exchange-rate',
        path: '/api/exchange-rate',
        validate: (json) => Number.isFinite(Number(json?.rate)) && Boolean(json?.source),
    },
    {
        name: 'holdings',
        path: '/api/holdings?symbol=SCHD&country=US',
        validate: (json) => json && Array.isArray(json.holdings),
    },
    {
        name: 'mdd',
        path: '/api/mdd?tickers=SCHD&years=1',
        validate: (json) => json && Object.prototype.hasOwnProperty.call(json, 'SCHD'),
    },
];

async function fetchJson(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(new URL(path, BASE_URL), {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        const text = await response.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch (error) {
            throw new Error(`invalid JSON: ${error.message}`);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
        return json;
    } finally {
        clearTimeout(timeout);
    }
}

const failures = [];

for (const check of checks) {
    try {
        const json = await fetchJson(check.path);
        if (!check.validate(json)) {
            failures.push(`${check.name}: unexpected response shape`);
            console.error(`FAIL ${check.name} shape`);
            continue;
        }
        console.log(`PASS ${check.name}`);
    } catch (error) {
        failures.push(`${check.name}: ${error.message}`);
        console.error(`FAIL ${check.name} ${error.message}`);
    }
}

if (failures.length > 0) {
    console.error('\nAPI shape check failed');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`\nAPI shape check passed: ${BASE_URL}`);
