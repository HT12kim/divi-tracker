import { parseCsvRows, readEucKr, findEtfCsv } from './utils/csv.js';

export const handler = async () => {
    try {
        const csvPath = findEtfCsv();
        if (!csvPath) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'ETF CSV not found' }),
            };
        }
        const text = readEucKr(csvPath);
        const rows = parseCsvRows(text);
        const result = [];
        for (const fields of rows) {
            const code = (fields[1] || '').trim();
            if (!code || !/^[A-Z0-9]{6}$/i.test(code)) continue;
            result.push({
                stdCode: (fields[0] || '').trim(),
                code: code.toUpperCase(),
                name: (fields[2] || '').trim(),
                shortName: (fields[3] || '').trim(),
                engName: (fields[4] || '').trim(),
                market: (fields[10] || '').trim(),
                assetType: (fields[11] || '').trim(),
                type: 'ETF',
            });
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=86400',
            },
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'internal error' }),
        };
    }
};
