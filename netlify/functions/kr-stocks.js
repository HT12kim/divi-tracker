import { parseCsvRows, readEucKr, findFile, stockCsvCandidates } from './utils/csv.js';

export const handler = async () => {
    try {
        const csvPath = findFile(stockCsvCandidates());
        if (!csvPath) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'CSV not found' }),
            };
        }

        const text = readEucKr(csvPath);
        const rows = parseCsvRows(text);
        const result = [];
        for (const fields of rows) {
            const code = (fields[1] || '').trim();
            if (!code || !/^\d{6}$/.test(code)) continue;
            result.push({
                code,
                name: (fields[2] || '').trim(),
                shortName: (fields[3] || '').trim(),
                engName: (fields[4] || '').trim(),
                market: (fields[6] || '').trim(),
            });
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=86400',
            },
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
