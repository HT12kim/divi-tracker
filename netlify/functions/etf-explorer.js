/**
 * ETF 탐색기 API
 * - GET /api/etf-explorer?fund=ARKK  → 구성종목 + 가격 + 3년 MDD + 최근 매매
 * - GET /api/etf-explorer?fund=BRK-B → 버크셔 구성종목 + 가격 + 3년 MDD
 */
import YahooFinance from 'yahoo-finance2';

const yahoo = new YahooFinance();

// ── ARKK 공식 CSV (ARK Invest) ────────────────────────────────────────────
const ARK_HOLDINGS_URL = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';
const ARK_TRADES_URL = 'https://arkfunds.io/api/v2/etf/trades?symbol=ARKK&period=1m';

// ── 가격 배치 조회 (Yahoo quoteSummary price 모듈) ─────────────────────────
const fetchPrices = async (tickers) => {
    const map = {};
    // 5개씩 병렬 조회
    const chunks = [];
    for (let i = 0; i < tickers.length; i += 5) chunks.push(tickers.slice(i, i + 5));

    await Promise.allSettled(
        chunks.map(async (chunk) => {
            await Promise.allSettled(
                chunk.map(async (ticker) => {
                    try {
                        const r = await yahoo.quoteSummary(ticker, { modules: ['price'] }, { validateResult: false });
                        map[ticker] = r?.price?.regularMarketPrice ?? null;
                    } catch (_) {
                        map[ticker] = null;
                    }
                }),
            );
        }),
    );
    return map;
};

// ── 3년 MDD 계산 ────────────────────────────────────────────────────────
const calcMdd3y = async (ticker) => {
    try {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 3);
        const period2 = new Date();
        const hist = await yahoo.historical(
            ticker,
            {
                period1: period1.toISOString().slice(0, 10),
                period2: period2.toISOString().slice(0, 10),
                interval: '1mo',
            },
            { validateResult: false },
        );
        if (!hist || hist.length < 3) return null;
        const closes = hist.map((d) => d.close).filter((v) => v != null && v > 0);
        let maxDrawdown = 0;
        let peak = closes[0];
        for (const c of closes) {
            if (c > peak) peak = c;
            const dd = (peak - c) / peak;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }
        return parseFloat((-maxDrawdown * 100).toFixed(1));
    } catch (_) {
        return null;
    }
};

// ── MDD 배치 계산 (상위 N개 종목만) ─────────────────────────────────────
const fetchMddBatch = async (tickers) => {
    const map = {};
    await Promise.allSettled(
        tickers.map(async (t) => {
            map[t] = await calcMdd3y(t);
        }),
    );
    return map;
};

// ── ARK CSV 파싱 ─────────────────────────────────────────────────────────
const fetchArkHoldings = async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(ARK_HOLDINGS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`ARK CSV HTTP ${res.status}`);
        const text = await res.text();
        const lines = text.trim().split(/\r?\n/);
        // 헤더 행 탐색 (date,fund,company,ticker 포함 행)
        let headerIdx = 0;
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            if (/company|ticker/i.test(lines[i])) {
                headerIdx = i;
                break;
            }
        }
        const headers = lines[headerIdx].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
        const idxTicker = headers.indexOf('ticker');
        const idxCompany = headers.indexOf('company');
        const idxWeight = headers.findIndex((h) => h.includes('weight'));
        const idxShares = headers.findIndex((h) => h.includes('shares'));

        const holdings = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            // CSV 필드 파서 (따옴표 지원)
            const fields = [];
            let inQ = false,
                cur = '';
            for (const ch of line) {
                if (ch === '"') {
                    inQ = !inQ;
                    continue;
                }
                if (ch === ',' && !inQ) {
                    fields.push(cur);
                    cur = '';
                    continue;
                }
                cur += ch;
            }
            fields.push(cur);

            const ticker = (fields[idxTicker] || '').trim();
            const name = (fields[idxCompany] || '').trim();
            const weight = idxWeight >= 0 ? parseFloat(fields[idxWeight]) || 0 : 0;
            const shares = idxShares >= 0 ? parseInt(fields[idxShares]?.replace(/,/g, '') || '0', 10) || 0 : 0;

            if (!ticker || ticker === '-') continue;
            holdings.push({ ticker, name, weight, shares });
        }
        // 비중 내림차순 정렬
        holdings.sort((a, b) => b.weight - a.weight);
        return holdings.slice(0, 30).map((h, i) => ({ rank: i + 1, ...h }));
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }
};

// ── Yahoo topHoldings 폴백 ───────────────────────────────────────────────
const fetchYahooHoldings = async (symbol) => {
    const r = await yahoo.quoteSummary(symbol, { modules: ['topHoldings'] }, { validateResult: false });
    const raw = r?.topHoldings?.holdings || [];
    return raw.slice(0, 30).map((h, i) => ({
        rank: i + 1,
        ticker: h.symbol || '',
        name: h.holdingName || h.symbol || '',
        weight: parseFloat(((h.holdingPercent || 0) * 100).toFixed(2)),
        shares: 0,
    }));
};

// ── ARK 최근 매매 내역 (arkfunds.io API) ─────────────────────────────────
const fetchArkTrades = async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    try {
        const res = await fetch(ARK_TRADES_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`arkfunds.io HTTP ${res.status}`);
        const json = await res.json();
        const trades = (json.trades || []).slice(0, 20).map((t) => ({
            date: t.date || '',
            direction: (t.direction || '').toUpperCase(), // BUY | SELL
            ticker: t.ticker || '',
            name: t.company || '',
            shares: t.shares ?? 0,
            etfPercent: t.etf_percent ? parseFloat(t.etf_percent.toFixed(4)) : null,
        }));
        return trades;
    } catch (e) {
        clearTimeout(tid);
        return [];
    }
};

// ── BRK 최근 13F SEC EDGAR 기반 구성종목 ─────────────────────────────────
// SEC EDGAR full-text search: 버크셔 CIK = 0001067983
const BRK_CIK = '0001067983';
const SEC_UA = 'DividendMaster/1.0 (fruciante86@gmail.com)';

// 주요 CUSIP → 티커 매핑 (버크셔 상위 포트폴리오 기준)
const CUSIP_TICKER = {
    '037833100': 'AAPL', // Apple
    '084670702': 'BRK-B', // Berkshire B
    '084670108': 'BRK-B',
    172967424: 'C', // Citigroup
    172967101: 'C',
    23135106: 'BAC', // Bank of America
    '060505104': 'BAC',
    '92826C839': 'V', // Visa
    '92826C109': 'V',
    670346105: 'OXY', // Occidental
    690561105: 'PBR',
    402635104: 'HPQ', // HP
    438516106: 'HON', // Honeywell
    459200101: 'IBM',
    '025816109': 'AXP', // American Express
    191216100: 'KO', // Coca-Cola
    205887102: 'CVX', // Chevron
    742718109: 'PG', // P&G
    '20602D101': 'CSCO',
    '30303M102': 'META',
    '023135106': 'BAC',
    444859102: 'HUM', // Humana
    '38141G104': 'GS', // Goldman Sachs
    166764100: 'CI', // Cigna
    718546104: 'MCO', // Moody's
    '053015103': 'AVB',
    247361702: 'DE', // Deere
    713401203: 'PNC',
    '26884L109': 'LVSATV',
    911363109: 'USB', // US Bancorp
    '92220P105': 'VER',
    '92826C101': 'V',
    '64110D104': 'NUE',
    '57636Q104': 'MA', // Mastercard
    '69349H107': 'PNC',
    '78468R103': 'SIRI',
    742718109: 'PG',
    '88160R101': 'TSLA',
    '023608102': 'T',
    369604103: 'GE',
};

const resolveCusip = (cusip, name) => {
    if (CUSIP_TICKER[cusip]) return CUSIP_TICKER[cusip];
    // 이름 기반 간단 매핑
    const nm = name.toUpperCase();
    if (nm.includes('APPLE')) return 'AAPL';
    if (nm.includes('BANK OF AMER')) return 'BAC';
    if (nm.includes('AMERICAN EXPRESS')) return 'AXP';
    if (nm.includes('COCA-COLA') || nm.includes('COCA COLA')) return 'KO';
    if (nm.includes('CHEVRON')) return 'CVX';
    if (nm.includes('OCCIDENTAL')) return 'OXY';
    if (nm.includes('MOODY')) return 'MCO';
    if (nm.includes('KRAFT HEINZ')) return 'KHC';
    if (nm.includes('VERISIGN')) return 'VRSN';
    if (nm.includes('DAVITA')) return 'DVA';
    if (nm.includes('HP INC') || nm.includes('HEWLETT')) return 'HPQ';
    if (nm.includes('US BANCORP')) return 'USB';
    if (nm.includes('VISA')) return 'V';
    if (nm.includes('MASTERCARD')) return 'MA';
    if (nm.includes('CITIGROUP')) return 'C';
    if (nm.includes('SIRIUS')) return 'SIRI';
    if (nm.includes('AMAZON')) return 'AMZN';
    if (nm.includes('CHARTER COMM')) return 'CHTR';
    if (nm.includes('LIBERTY')) return 'LLYVK';
    if (nm.includes('PILOT CORP')) return '';
    if (nm.includes('NUBANK') || nm.includes('NU HOLDINGS')) return 'NU';
    if (nm.includes('FLOOR & DECOR')) return 'FND';
    return '';
};

const fetchBrkHoldings = async () => {
    // 1) 최신 13F-HR 제출 목록 조회
    const listUrl = `https://data.sec.gov/submissions/CIK${BRK_CIK}.json`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    let filingAccession = null;
    try {
        const res = await fetch(listUrl, { headers: { 'User-Agent': SEC_UA }, signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`SEC submissions HTTP ${res.status}`);
        const json = await res.json();
        const filings = json.filings?.recent;
        if (!filings) throw new Error('No filings data');
        for (let i = 0; i < (filings.form || []).length; i++) {
            if (filings.form[i] === '13F-HR') {
                filingAccession = filings.accessionNumber[i];
                break;
            }
        }
        if (!filingAccession) throw new Error('13F-HR not found');
    } catch (e) {
        clearTimeout(tid);
        throw e;
    }

    // 2) 파일 목록에서 infoTable xml 파일 경로 확인 (디렉토리 HTML 파싱)
    const accNoSlash = filingAccession.replace(/-/g, '');
    const cikNum = parseInt(BRK_CIK, 10);
    const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoSlash}`;

    const ctrl2 = new AbortController();
    const tid2 = setTimeout(() => ctrl2.abort(), 8000);
    let xmlText = null;
    try {
        const dirRes = await fetch(`${baseUrl}/`, { headers: { 'User-Agent': SEC_UA }, signal: ctrl2.signal });
        clearTimeout(tid2);
        const html = dirRes.ok ? await dirRes.text() : '';
        const xmlLinks = [...html.matchAll(/href="([^"]*\.xml)"/gi)].map((m) => m[1]);
        // infotable 이름 우선, 없으면 숫자 파일명 (primary_doc 제외)
        let docPath = xmlLinks.find((l) => /infotable|13finfo/i.test(l));
        if (!docPath) docPath = xmlLinks.find((l) => /\/\d+\.xml$/.test(l) && !/primary_doc/i.test(l));
        if (!docPath) docPath = xmlLinks.find((l) => !/primary_doc/i.test(l) && l.endsWith('.xml'));

        if (docPath) {
            const xmlRes = await fetch(docPath.startsWith('http') ? docPath : `https://www.sec.gov${docPath}`, {
                headers: { 'User-Agent': SEC_UA },
            });
            if (xmlRes.ok) xmlText = await xmlRes.text();
        }
    } catch (e) {
        clearTimeout(tid2);
    }

    if (!xmlText) throw new Error('infoTable XML not found in 13F filing');

    // 3) XML 파싱
    const entries = xmlText.match(/<infoTable>[\s\S]*?<\/infoTable>/gi) || [];
    if (!entries.length) throw new Error('No infoTable entries in XML');

    const holdings = [];
    let totalValue = 0;
    for (const entry of entries) {
        const name = entry.match(/<nameOfIssuer>(.*?)<\/nameOfIssuer>/i)?.[1]?.trim() || '';
        const cusip = entry.match(/<cusip>(.*?)<\/cusip>/i)?.[1]?.trim() || '';
        const val = parseInt(entry.match(/<value>(.*?)<\/value>/i)?.[1]?.replace(/,/g, '') || '0', 10);
        const shrs = parseInt(entry.match(/<sshPrnamt>(.*?)<\/sshPrnamt>/i)?.[1]?.replace(/,/g, '') || '0', 10);
        if (!name || val <= 0) continue;
        totalValue += val;
        holdings.push({ name, cusip, value: val, shares: shrs });
    }
    if (!holdings.length) throw new Error('No valid holdings parsed');

    holdings.sort((a, b) => b.value - a.value);
    return holdings.slice(0, 30).map((h, i) => ({
        rank: i + 1,
        ticker: resolveCusip(h.cusip, h.name),
        name: h.name,
        weight: totalValue > 0 ? parseFloat(((h.value / totalValue) * 100).toFixed(2)) : 0,
        shares: h.shares,
    }));
};

// BRK 최근 매매 (13F 분기 비교 → 비중 변화)

// ── Netlify 핸들러 ────────────────────────────────────────────────────────
const HANDLER_TIMEOUT = 9000;

export const handler = async (event) => {
    const params = event.queryStringParameters || {};
    const fund = (params.fund || 'ARKK').toUpperCase().trim();

    if (!['ARKK', 'BRK-B'].includes(fund)) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'fund must be ARKK or BRK-B' }),
        };
    }

    const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Handler timeout')), HANDLER_TIMEOUT),
    );

    try {
        const work = async () => {
            let holdings = [];
            let trades = [];
            let source = '';
            let note = null;

            if (fund === 'ARKK') {
                // 1) ARKK 구성종목 (ARK 공식 CSV → Yahoo 폴백)
                try {
                    holdings = await fetchArkHoldings();
                    source = 'ARK Invest';
                } catch (e) {
                    holdings = await fetchYahooHoldings('ARKK');
                    source = 'Yahoo Finance';
                }
                // 2) 매매 내역
                trades = await fetchArkTrades();
            } else {
                // BRK-B: SEC EDGAR 13F 기반 → Yahoo 폴백
                try {
                    holdings = await fetchBrkHoldings();
                    source = 'SEC EDGAR 13F';
                } catch (e) {
                    holdings = await fetchYahooHoldings('BRK-B');
                    source = 'Yahoo Finance';
                }
                note = '버크셔 해서웨이는 SEC EDGAR 13F 기반 공시 데이터입니다. 분기 1회 업데이트 (45일 지연).';
                trades = [];
            }

            if (!holdings.length) throw new Error('No holdings data');

            // 3) 가격 조회 (전체)
            const tickers = holdings.map((h) => h.ticker).filter(Boolean);
            const priceMap = await fetchPrices(tickers);

            // 4) MDD 계산 (상위 15개)
            const mddTickers = tickers.slice(0, 15);
            const mddMap = await fetchMddBatch(mddTickers);

            // 5) 머지
            const enriched = holdings.map((h) => ({
                ...h,
                price: priceMap[h.ticker] ?? null,
                mdd3y: mddMap[h.ticker] ?? null,
            }));

            return { fund, holdings: enriched, trades, source, note, updatedAt: new Date().toISOString() };
        };

        const result = await Promise.race([work(), timeoutPromise]);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ fund, holdings: [], trades: [], error: err.message }),
        };
    }
};
