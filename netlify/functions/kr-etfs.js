import fs from 'fs';
import path from 'path';

// data_1131_*.csv 중 최신 파일 탐색
const findCsv = () => {
    const searchDirs = [
        process.cwd(),
        path.join(process.cwd(), 'netlify/functions'),
        path.join(process.cwd(), '.netlify/functions'),
    ];
    for (const dir of searchDirs) {
        try {
            const files = fs
                .readdirSync(dir)
                .filter((f) => /^data_1131_.*\.csv$/.test(f))
                .sort();
            if (files.length > 0) return path.join(dir, files[files.length - 1]);
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
        // 열 순서: 표준코드(0), 단축코드(1), 한국ETF명(2), 한국단축명(3), 영문명(4),
        //          상장일(5), 기초지수명(6), ..., 국내/해외(10), 자산유형(11)
        const code = (fields[1] || '').trim();
        // ETF 코드는 숫자+알파벳 6자리 (예: 0120J0, 069500)
        if (!code || !/^[A-Z0-9]{6}$/i.test(code)) continue;
        result.push({
            stdCode: (fields[0] || '').trim(), // 12자리 표준코드 (KRX API 조회용)
            code: code.toUpperCase(),
            name: (fields[2] || '').trim(),
            shortName: (fields[3] || '').trim(),
            engName: (fields[4] || '').trim(),
            market: (fields[10] || '').trim(), // 국내/해외
            assetType: (fields[11] || '').trim(), // 주식/채권/기타
            type: 'ETF',
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
                body: JSON.stringify({ error: 'ETF CSV not found' }),
            };
        }
        const buf = fs.readFileSync(csvPath);
        let text;
        try {
            text = new TextDecoder('euc-kr').decode(buf);
        } catch (_) {
            text = buf.toString('latin1');
        }
        const items = parseCsv(text);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'internal error' }),
        };
    }
};
