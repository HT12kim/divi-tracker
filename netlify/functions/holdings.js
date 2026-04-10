import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// ── KR: FnGuide (navercomp.wisereport.co.kr) ETF CU 구성종목 조회 ────────────
const FNGUIDE_ETF_URL = 'https://navercomp.wisereport.co.kr/v2/ETF/index.aspx';

const fetchFnGuideHoldings = async (shortCode) => {
    const url = `${FNGUIDE_ETF_URL}?cmp_cd=${shortCode}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            return { data: null, debugError: `FnGuide HTTP ${res.status}` };
        }
        const html = await res.text();

        // HTML 내 인라인 JS 변수 CU_data 추출
        const match = html.match(/var\s+CU_data\s*=\s*(\{[\s\S]*?\});/);
        if (!match) {
            return { data: null, debugError: 'FnGuide: CU_data not found in HTML' };
        }
        const cuData = JSON.parse(match[1]);
        const gridData = cuData.grid_data || [];
        if (!gridData.length) {
            return { data: null, debugError: 'FnGuide: grid_data empty' };
        }

        const tradingDate = (gridData[0].TRD_DT || '').replace(/-/g, '');

        // ETF_WEIGHT가 전부 null인 경우(해외 ETF 등) AGMT_STK_CNT 비율로 상대 가중치 계산
        const hasWeight = gridData.some((r) => r.ETF_WEIGHT != null);

        // 현금/채권/TRS 등 비주식 항목 키워드
        const CASH_KEYWORDS = ['현금', '채권', 'TRS', '국채', '단기자금', '통안증권', 'MMF', '예금'];
        const isCashEntry = (name) => CASH_KEYWORDS.some((k) => name.includes(k));

        let workingData = gridData;
        let weightApprox = false;

        if (!hasWeight) {
            // 주식 항목만 추려서 수량 기반 상대 가중치 계산
            const equityOnly = gridData.filter((r) => !isCashEntry(r.STK_NM_KOR || ''));
            workingData = equityOnly.length > 0 ? equityOnly : gridData;
            weightApprox = true;
        }

        const totalShares = weightApprox
            ? workingData.reduce((s, r) => s + (r.AGMT_STK_CNT || 0), 0)
            : 0;

        // 비중 기준 내림차순 정렬 후 상위 25개
        const sorted = [...workingData].sort((a, b) => {
            const wa = hasWeight ? (a.ETF_WEIGHT ?? 0) : (a.AGMT_STK_CNT || 0);
            const wb = hasWeight ? (b.ETF_WEIGHT ?? 0) : (b.AGMT_STK_CNT || 0);
            return wb - wa;
        });

        const holdings = sorted.slice(0, 25).map((row, idx) => {
            let weight;
            if (hasWeight) {
                weight = parseFloat((row.ETF_WEIGHT ?? 0).toFixed(2));
            } else {
                weight = totalShares > 0
                    ? parseFloat(((row.AGMT_STK_CNT || 0) / totalShares * 100).toFixed(2))
                    : 0;
            }
            return {
                rank: idx + 1,
                ticker: '',
                name: (row.STK_NM_KOR || '').trim(),
                weight,
                shares: row.AGMT_STK_CNT ? Math.round(row.AGMT_STK_CNT) : null,
                value: null,
            };
        });

        return { data: { holdings, source: 'FnGuide', tradingDate, weightApprox }, debugError: null };
    } catch (e) {
        clearTimeout(timeoutId);
        return { data: null, debugError: `FnGuide exception: ${e.message}` };
    }
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
            // 1순위: FnGuide (navercomp) CU 구성종목
            const fnResult = await fetchFnGuideHoldings(symbol);
            if (fnResult.debugError) debugErrors.push(fnResult.debugError);
            data = fnResult.data;

            // 2순위: FnGuide 실패 시 Yahoo Finance topHoldings 폴백
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
                    source: country === 'KR' ? 'FnGuide' : 'Yahoo',
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
