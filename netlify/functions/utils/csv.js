import fs from 'fs';
import path from 'path';

/**
 * 최소 CSV 파서 — 따옴표 필드(quoted fields) 지원.
 * @param {string} text - CSV 텍스트
 * @returns {string[][]} 2D 배열 (헤더 미포함, 첫 행 skip)
 */
export const parseCsvRows = (text) => {
    const lines = text.split(/\r?\n/);
    const rows = [];
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
        rows.push(fields);
    }
    return rows;
};

/**
 * EUC-KR 인코딩된 파일을 읽어 UTF-8 문자열로 반환.
 * Node 18+ full-ICU → euc-kr 디코딩, 실패 시 latin1 폴백.
 */
export const readEucKr = (filePath) => {
    const buf = fs.readFileSync(filePath);
    try {
        return new TextDecoder('euc-kr').decode(buf);
    } catch (_) {
        return buf.toString('latin1');
    }
};

/**
 * 여러 후보 경로에서 파일 탐색 (first match 반환).
 * @param {string[]} candidates - 절대 경로 배열
 * @returns {string|null}
 */
export const findFile = (candidates) => {
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch (_) {}
    }
    return null;
};

/**
 * vite.config.csv 경로 후보 (KR 주식 코드).
 */
export const stockCsvCandidates = () => [
    path.join(process.cwd(), 'vite.config.csv'),
    path.join(process.cwd(), 'netlify/functions/vite.config.csv'),
    path.join(process.cwd(), '.netlify/functions/vite.config.csv'),
];

/**
 * data_1131_*.csv (ETF) 최신 파일 탐색.
 */
export const findEtfCsv = () => {
    const dirs = [
        process.cwd(),
        path.join(process.cwd(), 'netlify/functions'),
        path.join(process.cwd(), '.netlify/functions'),
    ];
    for (const dir of dirs) {
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
