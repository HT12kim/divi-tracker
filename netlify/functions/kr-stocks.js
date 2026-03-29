import fs from 'fs';
import path from 'path';

const findCsv = () => {
    const candidates = [
        path.join(process.cwd(), 'vite.config.csv'),
        path.join(new URL(import.meta.url).pathname, '../../../vite.config.csv'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch (_) {}
    }
    return null;
};

// 최소 CSV 파서 (따옴표 필드 지원)
const parseCsv = (text) => {
    const lines = text.split(/\r?\n/);
    const result = [];
    for (let li = 1; li < lines.length; li++) {
        const line = lines[li].trim();
        if (!line) continue;
        const fields = [];
        let inQ = false;
        let cur = '';
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                inQ = !inQ;
                continue;
            }
            if (c === ',' && !inQ) {
                fields.push(cur);
                cur = '';
                continue;
            }
            cur += c;
        }
        fields.push(cur);
        // 열 순서: 표준코드, 단축코드, 한국종목명, 한국단축명, 영문명, 상장일, 시장구분, ...
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
    return result;
};

export const handler = async () => {
    try {
        const csvPath = findCsv();
        if (!csvPath) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'CSV not found' }),
            };
        }

        const buf = fs.readFileSync(csvPath);
        let text;
        try {
            // Node 18+ full-ICU 에서는 euc-kr 디코딩 지원
            text = new TextDecoder('euc-kr').decode(buf);
        } catch (_) {
            // fallback: 숫자/영문 코드는 ASCII와 동일하므로 일부 동작
            text = buf.toString('latin1');
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=86400',
            },
            body: JSON.stringify(parseCsv(text)),
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
