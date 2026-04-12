/**
 * Netlify Edge Function: og-inject
 * 소셜 봇이 /?ticker=SCHD 또는 /?page=portfolio 로 접근할 때
 * index.html 의 OG 태그를 동적으로 교체해 SNS 미리보기를 최적화합니다.
 */

const SOCIAL_BOT_RE =
    /facebookexternalhit|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot|googlebot-image|line-poker|pinterestbot|applebot|bingpreview/i;

export default async (request, context) => {
    const url = new URL(request.url);
    const ticker = url.searchParams.get('ticker')?.toUpperCase();
    const page = url.searchParams.get('page');

    // 관련 파라미터가 없으면 즉시 통과
    if (!ticker && page !== 'portfolio') return context.next();

    // 소셜 봇이 아닌 일반 사용자 → 통과 (불필요한 body 파싱 방지)
    const ua = request.headers.get('user-agent') ?? '';
    if (!SOCIAL_BOT_RE.test(ua)) return context.next();

    const response = await context.next();
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return response;

    const BASE_URL = 'https://divi-tracker.netlify.app';
    let title, description, ogUrl;

    if (page === 'portfolio') {
        title = '포트폴리오 엿보기 – ARKK·버크셔 구성종목·MDD | 배당의 민족';
        description = 'ARKK·버크셔해서웨이 포트폴리오 구성종목, 비중, 현재가, 3년 MDD를 실시간으로 확인하세요.';
        ogUrl = `${BASE_URL}/?page=portfolio`;
    } else {
        title = `${ticker} 배당금·배당락일·세후수령액 – 배당의 민족`;
        description = `${ticker} 배당금, 배당락일, 배당수익률을 실시간 조회하세요. 세후 실수령액 자동 계산. 배당의 민족 무료 제공`;
        ogUrl = `${BASE_URL}/?ticker=${encodeURIComponent(ticker)}`;
    }

    /** HTML 속성 값에 넣어도 안전하도록 이스케이프 */
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = await response.text();
    const injected = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
        .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
        .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
        .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${esc(ogUrl)}$2`)
        .replace(/(<meta\s+property="twitter:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
        .replace(/(<meta\s+property="twitter:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`);

    return new Response(injected, {
        status: response.status,
        headers: response.headers,
    });
};

export const config = { path: '/' };
