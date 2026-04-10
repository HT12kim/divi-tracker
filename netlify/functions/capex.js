import { inflateRaw } from 'zlib';
import { promisify } from 'util';

const inflateRawP = promisify(inflateRaw);
const SEC_USER_AGENT = 'DividendMaster/1.0 (fruciante86@gmail.com)';
const DART_API_KEY = process.env.DART_API_KEY || '';

// ── SEC EDGAR: ticker → CIK (regex 텍스트 스캔으로 전체 JSON.parse 회피) ────
let tickerToCikCache = {};

const findCikByTicker = async (ticker) => {
    const key = ticker.toUpperCase();
    if (tickerToCikCache[key]) return tickerToCikCache[key];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
            headers: { 'User-Agent': SEC_USER_AGENT },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`SEC tickers HTTP ${res.status}`);

        // 전체 JSON.parse 대신 regex 텍스트 스캔 → 특정 ticker의 CIK만 추출
        // 형식: {"cik_str": 320193, "ticker": "AAPL", "title": "..."}
        const text = await res.text();
        const reForward = new RegExp(`"cik_str"\\s*:\\s*(\\d+)[^}]+?"ticker"\\s*:\\s*"${key}"`, 'i');
        const reBackward = new RegExp(`"ticker"\\s*:\\s*"${key}"[^}]+?"cik_str"\\s*:\\s*(\\d+)`, 'i');
        const mf = reForward.exec(text);
        const mb = reBackward.exec(text);
        const cikNum = mf?.[1] ?? mb?.[1];
        if (!cikNum) return null;

        const cik = String(cikNum).padStart(10, '0');
        tickerToCikCache[key] = cik;
        return cik;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
};

// 우선순위 순으로 시도. CapitalExpendituresIncurredButNotYetPaid는 미지급 발생액이므로 제외.
const CAPEX_TAGS = [
    'PaymentsToAcquirePropertyPlantAndEquipment', // 가장 일반적 (AAPL, MSFT 등)
    'PaymentsToAcquireProductiveAssets', // NVDA 등 일부 기업
];

const fetchSecCapex = async (ticker) => {
    let cik;
    try {
        cik = await findCikByTicker(ticker);
    } catch (e) {
        return { data: null, debugError: `CIK lookup failed: ${e.message}` };
    }
    if (!cik) return { data: null, debugError: `CIK not found for ${ticker}` };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
            headers: { 'User-Agent': SEC_USER_AGENT },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) return { data: null, debugError: `SEC XBRL HTTP ${res.status}` };

        const facts = await res.json();
        const usgaap = facts.facts?.['us-gaap'] || {};

        // 모든 태그에서 데이터를 수집하고 가장 최신 연도를 가진 태그를 선택
        // (첫 번째 태그에 구식 데이터만 있을 경우 더 최신 태그를 사용하기 위함)
        let tagUsed = '';
        let annual = [];

        const tagCandidates = [];
        for (const tag of CAPEX_TAGS) {
            const units = usgaap[tag]?.units?.USD || [];
            // 10-K/A(수정 보고서)도 포함, fp=FY로 연간 항목만
            const fyEntries = units.filter((u) => (u.form === '10-K' || u.form === '10-K/A') && u.fp === 'FY' && u.end);
            if (fyEntries.length === 0) continue;

            // end 날짜로 dedup: 하나의 10-K는 3년치 비교 데이터를 포함하므로
            // end 날짜 기준으로 그룹화하고 가장 최근 filed를 사용
            const byEnd = {};
            for (const u of fyEntries) {
                if (!byEnd[u.end] || u.filed > byEnd[u.end].filed) byEnd[u.end] = u;
            }
            let rows = Object.values(byEnd)
                .map((u) => ({
                    year: Number(u.end.substring(0, 4)), // end 날짜의 연도 사용
                    amount: u.val,
                    filed: u.filed,
                }))
                .sort((a, b) => a.year - b.year);

            // 동일 연도가 여럿이면 (회계연도가 1월 마감 등) 가장 최신 filed 유지
            const byYear = {};
            for (const u of rows) {
                if (!byYear[u.year] || u.filed > byYear[u.year].filed) byYear[u.year] = u;
            }
            rows = Object.values(byYear).sort((a, b) => a.year - b.year);

            if (rows.length > 0) {
                tagCandidates.push({ tag, rows, maxYear: Math.max(...rows.map((r) => r.year)) });
            }
        }

        if (tagCandidates.length > 0) {
            // 가장 최신 연도를 가진 태그 선택, 동점이면 데이터 수 많은 것
            tagCandidates.sort((a, b) => b.maxYear - a.maxYear || b.rows.length - a.rows.length);
            tagUsed = tagCandidates[0].tag;
            annual = tagCandidates[0].rows;
        }

        if (!annual.length) {
            return { data: null, debugError: `No CAPEX XBRL tags found for CIK ${cik}` };
        }

        // 최근 6년만
        const recent = annual.slice(-6);
        const companyName = facts.entityName || ticker;

        return {
            data: {
                ticker,
                companyName,
                currency: 'USD',
                unit: 'dollars',
                xbrlTag: tagUsed,
                annual: recent.map((r) => ({
                    year: r.year,
                    amount: r.amount,
                    amountFormatted: formatUSD(r.amount),
                })),
                source: 'SEC EDGAR',
            },
            debugError: null,
        };
    } catch (e) {
        clearTimeout(timeoutId);
        return { data: null, debugError: `SEC exception: ${e.message}` };
    }
};

const formatUSD = (val) => {
    if (Math.abs(val) >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    return val.toLocaleString('en-US');
};

// ── 순수 Node.js ZIP 파서 (system unzip 불필요) ───────────────────────────
// 스트리밍 ZIP은 로컬 헤더의 compressedSize가 0일 수 있으므로
// Central Directory(항상 정확한 크기 보유)에서 크기를 읽음
const readFirstZipEntry = async (buf) => {
    // 1. EOCD(End of Central Directory) 탐색: 끝에서 역방향으로 0x06054b50 탐색
    let eocdPos = buf.length - 22;
    while (eocdPos >= 0 && buf.readUInt32LE(eocdPos) !== 0x06054b50) eocdPos--;
    if (eocdPos < 0) throw new Error('ZIP: EOCD signature not found');

    // 2. Central Directory 위치와 항목 수
    const cdOffset = buf.readUInt32LE(eocdPos + 16);
    // cdCount = buf.readUInt16LE(eocdPos + 8) — 첫 번째 항목만 필요

    // 3. Central Directory 첫 항목 파싱 (signature 0x02014b50)
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('ZIP: Central Directory signature not found');
    const compression = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const fnLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHdrOffset = buf.readUInt32LE(cdOffset + 42);

    // 4. Local file header에서 실제 데이터 시작 위치 계산
    const lFnLen = buf.readUInt16LE(localHdrOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHdrOffset + 28);
    const dataStart = localHdrOffset + 30 + lFnLen + lExtraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    if (compression === 0) return compressedData; // STORE
    if (compression === 8) return inflateRawP(compressedData); // DEFLATE
    throw new Error(`ZIP: unsupported compression method ${compression}`);
};

// ── DART: 종목코드 → corp_code → 재무제표 CAPEX ────────────────────────────
let corpCodeMap = null;
let corpCodeMapExpiry = 0;

const loadCorpCodeMap = async () => {
    const now = Date.now();
    if (corpCodeMap && now < corpCodeMapExpiry) return corpCodeMap;

    if (!DART_API_KEY) throw new Error('DART_API_KEY not configured');

    const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`);
    if (!res.ok) throw new Error(`DART corpCode HTTP ${res.status}`);

    const zipBuf = Buffer.from(await res.arrayBuffer());
    // 순수 JS ZIP 파서: system unzip 바이너리 불필요
    const xmlBuf = await readFirstZipEntry(zipBuf);
    const xml = xmlBuf.toString('utf-8');

    const map = {};
    const entries = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
    for (const entry of entries) {
        const sc = entry.match(/<stock_code>([^<]+)/)?.[1]?.trim();
        const cc = entry.match(/<corp_code>([^<]+)/)?.[1]?.trim();
        if (sc && sc.trim() && cc) map[sc] = cc;
    }

    corpCodeMap = map;
    corpCodeMapExpiry = now + 24 * 60 * 60 * 1000; // 24시간 캐시
    return map;
};

const CAPEX_KR_PATTERNS = [/유형자산의\s*취득/, /유형자산\s*취득/, /설비투자/, /자본적\s*지출/];

const parseKrAmount = (s) => {
    if (!s) return null;
    const cleaned = s.replace(/,/g, '').trim();
    const n = parseInt(cleaned, 10);
    return isNaN(n) ? null : n;
};

const formatKRW = (val) => {
    const abs = Math.abs(val);
    if (abs >= 1e12) return (val / 1e12).toFixed(2) + '조';
    if (abs >= 1e8) return (val / 1e8).toFixed(0) + '억';
    return val.toLocaleString('ko-KR');
};

// reprt_code: 11011=사업보고서(연간), 11014=3Q, 11012=반기, 11013=1Q
const fetchDartCapex = async (stockCode) => {
    if (!DART_API_KEY) return { data: null, debugError: 'DART_API_KEY not set' };

    const map = await loadCorpCodeMap();
    const corpCode = map[stockCode];
    if (!corpCode) {
        return {
            data: null,
            debugError: `corp_code not found for ${stockCode} (map size: ${Object.keys(map).length})`,
        };
    }

    // 최근 2개 사업보고서(연간)서 당기+전기+전전기 → 최대 5-6년치
    const currentYear = new Date().getFullYear();
    const yearsToFetch = [currentYear - 1, currentYear - 2]; // 가장 최근 사업보고서
    const byYear = {}; // { year: amount }
    const debugErrors = [];

    for (const yr of yearsToFetch) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
            const url = `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bsns_year=${yr}&reprt_code=11011&fs_div=CFS`;
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            const json = await res.json();
            if (json.status !== '000') {
                debugErrors.push(`DART ${yr}: ${json.status} ${json.message}`);
                continue;
            }

            // CF 섹션에서 CAPEX 항목 찾기
            const cfItems = (json.list || []).filter((i) => i.sj_div === 'CF');
            let capexItem = null;
            for (const pattern of CAPEX_KR_PATTERNS) {
                capexItem = cfItems.find((i) => pattern.test(i.account_nm));
                if (capexItem) break;
            }

            if (capexItem) {
                const thstrm = parseKrAmount(capexItem.thstrm_amount);
                const frmtrm = parseKrAmount(capexItem.frmtrm_amount);
                const bfefrmtrm = parseKrAmount(capexItem.bfefrmtrm_amount);
                if (thstrm != null) byYear[yr] = thstrm;
                if (frmtrm != null && !byYear[yr - 1]) byYear[yr - 1] = frmtrm;
                if (bfefrmtrm != null && !byYear[yr - 2]) byYear[yr - 2] = bfefrmtrm;
            } else {
                debugErrors.push(`DART ${yr}: CAPEX account not found in CF items (${cfItems.length} items)`);
            }
        } catch (e) {
            clearTimeout(timeoutId);
            debugErrors.push(`DART ${yr} exception: ${e.message}`);
        }
    }

    if (Object.keys(byYear).length === 0) {
        return { data: null, debugError: debugErrors.join(' || ') };
    }

    const annual = Object.entries(byYear)
        .map(([year, amount]) => ({
            year: Number(year),
            amount: Math.abs(amount), // CAPEX는 현금유출이므로 음수일 수 있음 → 절대값
            amountFormatted: formatKRW(Math.abs(amount)),
        }))
        .sort((a, b) => a.year - b.year);

    return {
        data: {
            ticker: stockCode,
            companyName: '',
            currency: 'KRW',
            unit: 'won',
            annual,
            source: 'DART',
        },
        debugError: debugErrors.length ? debugErrors.join(' || ') : null,
    };
};

// ── Netlify Handler ────────────────────────────────────────────────────────
export const handler = async (event) => {
    const params = event.queryStringParameters || {};
    const symbol = (params.symbol || '').trim();
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
            const shortCode = symbol.replace(/\.KS|\.KQ/i, '');
            const result = await fetchDartCapex(shortCode);
            if (result.debugError) debugErrors.push(result.debugError);
            data = result.data;
        } else {
            const ticker = symbol.replace(/\.(US|N|O|A)$/i, '');
            const result = await fetchSecCapex(ticker);
            if (result.debugError) debugErrors.push(result.debugError);
            data = result.data;
        }

        if (!data) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                body: JSON.stringify({
                    annual: [],
                    source: country === 'KR' ? 'DART' : 'SEC EDGAR',
                    error: 'No CAPEX data available',
                    debug_error: debugErrors.join(' || '),
                }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
            body: JSON.stringify({
                ...data,
                updatedAt: new Date().toISOString(),
                debug_error: debugErrors.length ? debugErrors.join(' || ') : undefined,
            }),
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                annual: [],
                error: err.message || 'internal error',
                debug_error: debugErrors.join(' || '),
            }),
        };
    }
};
