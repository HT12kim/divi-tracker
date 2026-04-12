const KSD_DIVINFO_URL = 'http://api.seibro.or.kr/openapi/service/CorpSvc/getDivInfo';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const formatToday = () => {
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
    }

    const issucoCustno = event.queryStringParameters?.issucoCustno;
    const rgtStdDt = event.queryStringParameters?.rgtStdDt || formatToday();
    if (!issucoCustno) {
        return { statusCode: 400, headers: corsHeaders, body: 'issucoCustno required' };
    }

    const serviceKey = process.env.KSD_SERVICE_KEY || process.env.VITE_KSD_SERVICE_KEY;
    if (!serviceKey) {
        return {
            statusCode: 503,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'KSD service key not configured' }),
        };
    }

    const params = new URLSearchParams({
        serviceKey,
        pageNo: '1',
        numOfRows: '60',
        issucoCustno,
        rgtStdDt,
    });

    try {
        const upstream = await fetch(`${KSD_DIVINFO_URL}?${params.toString()}`);
        const body = await upstream.text();
        const contentType = upstream.headers.get('content-type') || 'application/xml; charset=utf-8';
        return {
            statusCode: upstream.ok ? 200 : upstream.status,
            headers: { ...corsHeaders, 'Content-Type': contentType },
            body,
        };
    } catch (err) {
        return {
            statusCode: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message || 'fetch failed' }),
        };
    }
};
