import fs from 'fs';
import path from 'path';
import yahooFinance from 'yahoo-finance2';

// ── KR: data_1131_*.csv 에서 6자리 단축코드 → 12자리 표준코드 매핑 ───────────
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

let stdCodeMap = null; // { '069500': 'KR7069500007', ... }

// kr-etfs.js 와 동일한 따옴표 필드 파서 — 쉼표가 포함된 종목명 대응
const parseCsvRow = (line) => {
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
    return fields;
};

const buildStdCodeMap = () => {
    if (stdCodeMap) return stdCodeMap;
    const csvPath = findCsv();
    if (!csvPath) return {};
    const buf = fs.readFileSync(csvPath);
    let text;
    try {
        text = new TextDecoder('euc-kr').decode(buf);
    } catch (_) {
        text = buf.toString('latin1');
    }
    const lines = text.split(/\r?\n/);
    const map = {};
    for (let li = 1; li < lines.length; li++) {
        const line = lines[li].trim();
        if (!line) continue;
        const fields = parseCsvRow(line);
        const stdCode = (fields[0] || '').trim();
        const shortCode = (fields[1] || '').trim().toUpperCase();
        if (shortCode && /^[A-Z0-9]{6}$/i.test(shortCode) && stdCode) {
            map[shortCode] = stdCode;
        }
    }
    stdCodeMap = map;
    return map;
};

// ── KR: KRX 정보데이터시스템 ETF 구성종목 조회 ─────────────────────────────
const KRX_URL = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';

const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
};

// 영업일 후보: 오늘로부터 최대 7일 전까지 순서대로 시도
const getRecentTradingDates = () => {
    const dates = [];
    const d = new Date();
    for (let i = 0; i < 7; i++) {
        const day = d.getDay(); // 0=일, 6=토
        if (day !== 0 && day !== 6) dates.push(toDateStr(d));
        d.setDate(d.getDate() - 1);
    }
    return dates;
};

const fetchKrxHoldings = async (shortCode) => {
    const map = buildStdCodeMap();
    const stdCode = map[shortCode.toUpperCase()];
    if (!stdCode)
        return {
            data: null,
            debugError: `stdCode not found for ${shortCode} (CSV map size: ${Object.keys(map).length})`,
        };

    const dates = getRecentTradingDates();
    const errors = [];
    for (const trdDd of dates) {
        const body = new URLSearchParams({
            bld: 'dbms/MDC/STAT/standard/MDCSTAT04301',
            isuCd: stdCode,
            trdDd,
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(KRX_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0',
                    Referer: 'https://data.krx.co.kr/',
                },
                body: body.toString(),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                errors.push(`KRX HTTP ${res.status} (${trdDd})`);
                continue;
            }
            const json = await res.json();
            const output = json.output || json.Output || [];
            if (!output.length) {
                errors.push(`KRX empty output (${trdDd})`);
                continue;
            }

            const holdings = output.slice(0, 25).map((row, idx) => ({
                rank: idx + 1,
                ticker: (row.ISU_SRT_CD || '').trim(),
                name: (row.ISU_NM || row.ISU_ABBRV || '').trim(),
                weight: parseFloat(row.VALU_PT || 0),
                shares: parseInt((row.SHRS || '0').replace(/,/g, ''), 10),
                value: parseInt((row.APPRAISVAL || '0').replace(/,/g, ''), 10),
            }));

            return { data: { holdings, source: 'KRX', tradingDate: trdDd }, debugError: null };
        } catch (e) {
            clearTimeout(timeoutId);
            errors.push(`KRX exception (${trdDd}): ${e.message}`);
            continue;
        }
    }
    return { data: null, debugError: errors.join(' | ') };
};

// ── US/KR 공통: Yahoo Finance topHoldings ────────────────────────────────
// validateResult:false — yahoo-finance2 v3의 스키마 엄격 검증 비활성화
const fetchYahooHoldings = async (symbol) => {
    let result;
    try {
        result = await yahooFinance.quoteSummary(symbol, { modules: ['topHoldings'] }, { validateResult: false });
    } catch (e) {
        throw new Error(`Yahoo quoteSummary failed: ${e.message}`);
    }
    const raw = result?.topHoldings?.holdings || [];
    if (!raw.length) return null;

    const holdings = raw.slice(0, 25).map((h, idx) => ({
        rank: idx + 1,
        ticker: h.symbol || '',
        name: h.holdingName || h.symbol || '',
        weight: parseFloat(((h.holdingPercent || 0) * 100).toFixed(2)),
        shares: null,
        value: null,
    }));

    return { holdings, source: 'Yahoo' };
};

// ── Netlify Handler ────────────────────────────────────────────────────────
export const handler = async (event) => {
    const params = event.queryStringParameters || {};
    const symbol = (params.symbol || '').trim().toUpperCase();
    const country = (params.country || 'US').toUpperCase();

    if (!symbol) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'symbol is required' }),
        };
    }

    const debugErrors = [];

    try {
        let data = null;

        if (country === 'KR') {
            // 1순위: KRX 정보데이터시스템
            const krxResult = await fetchKrxHoldings(symbol);
            if (krxResult.debugError) debugErrors.push(krxResult.debugError);
            data = krxResult.data;

            // 2순위: KRX 실패 시 Yahoo Finance topHoldings 폴백
            if (!data) {
                try {
                    const yahooSymbol = symbol + '.KS';
                    const yahooData = await fetchYahooHoldings(yahooSymbol);
                    if (yahooData) {
                        data = { ...yahooData, source: 'Yahoo(KR)' };
                    } else {
                        debugErrors.push('Yahoo KR fallback: empty holdings');
                    }
                } catch (ye) {
                    debugErrors.push(`Yahoo KR fallback error: ${ye.message}`);
                }
            }
        } else {
            try {
                data = await fetchYahooHoldings(symbol);
                if (!data) debugErrors.push('Yahoo: empty holdings');
            } catch (ye) {
                debugErrors.push(`Yahoo error: ${ye.message}`);
            }
        }

        if (!data) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                body: JSON.stringify({
                    holdings: [],
                    source: country === 'KR' ? 'KRX' : 'Yahoo',
                    error: 'No data available',
                    debug_error: debugErrors.join(' || '),
                }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
            body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() }),
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                holdings: [],
                error: err.message || 'internal error',
                debug_error: debugErrors.join(' || '),
            }),
        };
    }
};
