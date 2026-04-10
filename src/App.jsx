// ============================================================
//  Dividend Master – 티커 검색 & 배당 일정 조회
//  단일 파일 React 컴포넌트 (src/App.jsx)
// ============================================================

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import {
    Search,
    X,
    TrendingUp,
    CalendarDays,
    DollarSign,
    Sun,
    Moon,
    Info,
    Percent,
    BarChart2,
    Clock,
    BookmarkPlus,
    AlertCircle,
} from 'lucide-react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
// ─────────────────────────────────────────────
// 2. 프리셋 티커 (표시용)
// ─────────────────────────────────────────────
const PRESET_TICKERS = ['QQQ', 'SCHD', 'JEPI', 'JEPQ', 'AAPL', 'MSFT', 'KO', 'T', 'O', '005930', '000660'];
const CACHE_VERSION = 5; // 버전 올리면 모든 stale 캐시 자동 파기

// ─────────────────────────────────────────────
// 3. 공용 상수
// ─────────────────────────────────────────────
const DEFAULT_EXCHANGE_RATE = 1350;
const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const CURRENT_MONTH = TODAY.getMonth();
const MONTH_SHORT = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// ─────────────────────────────────────────────
// 4. 유틸리티
// ─────────────────────────────────────────────
const toKRW = (amount, currency, rate = DEFAULT_EXCHANGE_RATE) => (currency === 'USD' ? amount * rate : amount);

const fmtKRW = (v) =>
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(v);

const fmtUSD = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

const fmtNum = (v, currency) => (currency === 'USD' ? fmtUSD(v) : fmtKRW(v));

const parseDate = (s) => new Date(s);

const fmtMD = (s) => {
    const d = parseDate(s);
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
};

const dDay = (dateStr) => Math.ceil((parseDate(dateStr) - TODAY) / (1000 * 60 * 60 * 24));

const nextExDate = (stock) => {
    const futures = stock.events
        .filter((e) => parseDate(e.exDate) >= TODAY)
        .sort((a, b) => parseDate(a.exDate) - parseDate(b.exDate));
    return futures[0] || null;
};

// ─────────────────────────────────────────────
// 4. 테마 컨텍스트
// ─────────────────────────────────────────────
const ThemeContext = createContext(null);

function ThemeProvider({ children }) {
    const [dark, setDark] = useState(() => {
        const s = localStorage.getItem('dm-theme');
        return s ? s === 'dark' : true;
    });
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('dm-theme', dark ? 'dark' : 'light');
    }, [dark]);
    const toggle = useCallback(() => setDark((d) => !d), []);
    return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}

function KakaoShareButton() {
    const handleShare = () => {
        if (!window.Kakao?.Share) return;
        window.Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
                title: '배당의 민족 – Dividend Master',
                description: 'SCHD·JEPI·JEPQ·삼성전자 배당락일·배당금·수익률 실시간 조회',
                imageUrl: 'https://divi-tracker.netlify.app/divi-tracker.png',
                link: {
                    mobileWebUrl: 'https://divi-tracker.netlify.app',
                    webUrl: 'https://divi-tracker.netlify.app',
                },
            },
            buttons: [
                {
                    title: '배당 조회하기',
                    link: {
                        mobileWebUrl: 'https://divi-tracker.netlify.app',
                        webUrl: 'https://divi-tracker.netlify.app',
                    },
                },
            ],
        });
    };
    return (
        <button
            onClick={handleShare}
            aria-label="카카오톡으로 공유하기"
            className="fixed bottom-6 left-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl
                bg-[#FEE500] hover:bg-[#F0D800] active:bg-[#E6CD00]
                text-[#3A1D1D] font-semibold text-sm
                shadow-lg shadow-black/20 transition-all hover:scale-105 active:scale-95"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 3C6.477 3 2 6.925 2 11.5c0 2.91 1.747 5.467 4.375 6.993L5.25 21.5l4.688-2.45A11.3 11.3 0 0 0 12 19.25c5.523 0 10-3.925 10-8.75C22 5.925 17.523 2 12 2z" />
            </svg>
            카카오톡 공유
        </button>
    );
}

function SearchBar({ onSelect, onFetch, liveCache, krStocks, krEtfs, krDataReady }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [debounced, setDebounced] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggest, setLoadingSuggest] = useState(false);
    const [errorSuggest, setErrorSuggest] = useState(null);
    const wrapRef = useRef(null);
    const norm = (v) => v.trim().toLowerCase();
    const q = norm(query.trim());

    // debounce 입력값
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 250);
        return () => clearTimeout(t);
    }, [query]);

    // 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // 원격 추천 (Yahoo search) 호출
    useEffect(() => {
        if (debounced.length < 2) {
            setSuggestions([]);
            setErrorSuggest(null);
            return;
        }
        // 한글 입력이면 로컬 KR 목록으로만 처리, Yahoo 호출 생략
        if (/[가-힣]/.test(debounced)) {
            setSuggestions([]);
            setLoadingSuggest(false);
            return;
        }
        const controller = new AbortController();
        setLoadingSuggest(true);
        setErrorSuggest(null);
        const enc = encodeURIComponent;
        const url = `/api/search?q=${enc(debounced)}&lang=ko-KR&region=KR`;

        const normalizeKR = (s) => {
            // KRX:123456 → 123456.KS, 숫자 6자리 → .KS
            if (/^KRX:/i.test(s)) return s.replace(/^KRX:/i, '') + '.KS';
            if (/^[0-9]{6}$/.test(s)) return s + '.KS';
            return s;
        };

        fetch(url, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
            .then((data) => {
                const list = (data.quotes || [])
                    .filter((q) => q.symbol && q.quoteType !== 'CRYPTOCURRENCY')
                    .map((q) => ({
                        symbol: normalizeKR(q.symbol),
                        shortname: q.shortname,
                        longname: q.longname,
                        quoteType: q.quoteType,
                        exchange: q.exchDisp || q.exchange,
                    }));
                setSuggestions(list);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setErrorSuggest('검색에 실패했습니다');
            })
            .finally(() => setLoadingSuggest(false));
        return () => controller.abort();
    }, [debounced]);

    const dataset = liveCache || {};

    const cacheResults =
        q.length === 0
            ? []
            : Object.values(dataset).filter((s) => {
                  const aliases = s.aliases || [];
                  return (
                      norm(s.ticker).includes(q) || norm(s.name).includes(q) || aliases.some((a) => norm(a).includes(q))
                  );
              });

    // 로컬 CSV 검색 — 한글(종목명·단축명) / 영문(단축명·영문명) / 숫자(코드) 모두 지원
    const isKoreanQuery = q.length > 0 && /[가-힣]/.test(q);
    // 한글은 1자부터, 영문/숫자는 2자부터 로컬 CSV 검색 실행
    const isLocalSearch = isKoreanQuery ? q.length >= 1 : q.length >= 2;
    const qUp = q.toUpperCase();
    const isCodeQuery = /^\d{1,6}$/.test(q);

    const localKrResults = isLocalSearch
        ? (() => {
              const filterFn = (s) => {
                  // isKoreanQuery여도 영문 접두사("ACE", "TIGER" 등) 포함 가능 → 항상 대소문자 무시 비교
                  if (isKoreanQuery)
                      return (s.name || '').toLowerCase().includes(q) || (s.shortName || '').toLowerCase().includes(q);
                  if (isCodeQuery) return s.code.startsWith(q);
                  // 순수 영문/숫자: shortName·engName 대소문자 무시
                  return (
                      (s.shortName || '').toUpperCase().includes(qUp) || (s.engName || '').toUpperCase().includes(qUp)
                  );
              };
              const sortScore = (s) => {
                  // q는 항상 소문자, sn/n도 소문자로 통일해 대소문자 무관 정렬
                  const sn = (s.shortName || '').toLowerCase();
                  const cmp = isKoreanQuery ? q : q; // q already lowercase
                  if (sn === cmp) return 0;
                  if (sn.startsWith(cmp)) return 1;
                  if (sn.includes(cmp)) return 2;
                  const n = (s.name || '').toLowerCase();
                  return n.includes(cmp) ? 3 : 4;
              };
              return [...krStocks, ...krEtfs]
                  .filter(filterFn)
                  .sort((a, b) => {
                      const d = sortScore(a) - sortScore(b);
                      return d !== 0 ? d : (a.shortName || '').length - (b.shortName || '').length;
                  })
                  .slice(0, 20)
                  .map((s) => ({
                      ticker: s.code + '.KS',
                      name: s.shortName || s.name,
                      _fullName: s.name,
                      quoteType: s.type === 'ETF' ? 'ETF' : '주식',
                      exchange: s.assetType || s.market,
                      _source: 'krLocal',
                  }));
          })()
        : [];

    // CSV 한글명 조회 헬퍼 — 6자리 코드로 krStocks·krEtfs 검색
    const lookupKrName = (ticker) => {
        const sixDigit = (ticker || '').replace(/\.(KS|KQ)$/i, '').replace(/^KRX:/i, '');
        if (!/^\d{6}$/.test(sixDigit)) return null;
        const match = [...krStocks, ...krEtfs].find((s) => s.code === sixDigit);
        return match ? match.shortName || match.name || null : null;
    };

    const mergedResults = [];
    const seen = new Set();

    // 로컬 한국 종목 최우선
    localKrResults.forEach((s) => {
        const t = s.ticker.toUpperCase();
        if (seen.has(t)) return;
        seen.add(t);
        mergedResults.push(s);
    });

    cacheResults.forEach((s) => {
        const t = s.ticker.toUpperCase();
        if (seen.has(t)) return;
        seen.add(t);
        const krName = lookupKrName(s.ticker);
        mergedResults.push({
            ...s,
            name: krName || s.displayName || s.name,
            _source: 'cache',
        });
    });

    suggestions.forEach((s) => {
        const t = s.symbol.toUpperCase();
        if (seen.has(t)) return;
        seen.add(t);
        const krName = lookupKrName(s.symbol);
        mergedResults.push({
            ticker: t,
            name: krName || s.shortname || s.longname || t,
            shortName: s.shortname,
            longName: s.longname,
            quoteType: s.quoteType,
            exchange: s.exchange,
            _source: 'suggestion',
        });
    });

    const handleSelect = (stock) => {
        onSelect(stock);
        setQuery('');
        setOpen(false);
    };

    const freqLabel = {
        monthly: '월배당',
        quarterly: '분기',
        semiannual: '반기',
        annual: '연 1회',
        none: '비배당주',
    };

    // 한글 입력 시: krDataReady가 false면 아직 CSV 로딩 중
    const isKrDataLoading = isKoreanQuery && isLocalSearch && !krDataReady;
    const hasDropdown =
        open && (mergedResults.length > 0 || loadingSuggest || errorSuggest || (isKoreanQuery && isLocalSearch));

    return (
        <div ref={wrapRef} className="relative w-full max-w-xl">
            <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl
        bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70
        shadow-lg shadow-black/5 focus-within:ring-2 focus-within:ring-orange-400 transition-all"
            >
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                    type="text"
                    value={query}
                    placeholder="티커 또는 종목명 검색  (예: SCHD, 삼성전자)"
                    className="flex-1 bg-transparent text-base sm:text-sm text-slate-800 dark:text-slate-200
                    placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            // Enter는 항상 최신 데이터 fetch — 드롭다운 선택은 클릭으로
                            if (onFetch && q.length > 0) {
                                onFetch(query.trim());
                                setQuery('');
                                setOpen(false);
                            }
                        }
                        if (e.key === 'Escape') setOpen(false);
                    }}
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setOpen(false);
                        }}
                        className="text-slate-400 hover:text-orange-500 dark:hover:text-slate-300 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {hasDropdown && (
                <div
                    className="absolute top-full mt-2 left-0 right-0 z-50 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70"
                >
                    {isKrDataLoading && (
                        <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
                            종목 목록 불러오는 중...
                        </div>
                    )}
                    {loadingSuggest && (
                        <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">검색 중...</div>
                    )}
                    {errorSuggest && (
                        <div className="px-4 py-3 text-sm text-red-500 dark:text-red-400">{errorSuggest}</div>
                    )}
                    {!isKrDataLoading &&
                        !loadingSuggest &&
                        !errorSuggest &&
                        mergedResults.length === 0 &&
                        q.length > 0 && (
                            <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">검색 결과 없음</div>
                        )}
                    {mergedResults.map((s) => {
                        const isSuggestion = s._source === 'suggestion' || s._source === 'krLocal';
                        const next = !isSuggestion ? nextExDate(s) : null;
                        const dd = next ? dDay(next.exDate) : null;
                        const yieldText =
                            !isSuggestion && typeof s.dividendYield === 'number'
                                ? s.dividendYield.toFixed(2) + '%'
                                : '—';
                        const freqText = isSuggestion ? s.quoteType || '검색 결과' : freqLabel[s.frequency] || '—';
                        return (
                            <button
                                key={s.ticker}
                                onClick={() => {
                                    if (isSuggestion) {
                                        onFetch && onFetch(s.ticker);
                                        setQuery('');
                                        setOpen(false);
                                    } else {
                                        handleSelect(s);
                                    }
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left
                  hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors
                  border-b border-slate-100 dark:border-slate-700 last:border-0"
                            >
                                <div
                                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
                  flex items-center justify-center flex-shrink-0"
                                >
                                    <span className="text-white text-xs font-bold">{s.ticker.slice(0, 2)}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        {/[가-힣]/.test(s.name) ? s.name : s.ticker}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {/[가-힣]/.test(s.name)
                                            ? s.ticker
                                            : s.name || s.longName || s.shortName || s.exchange || ''}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                        {yieldText}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {/[가-힣]/.test(s.name) ? (
                                            <span
                                                className={
                                                    'px-1.5 py-0.5 rounded text-[10px] font-semibold ' +
                                                    (s.quoteType === 'ETF'
                                                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                                                        : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300')
                                                }
                                            >
                                                {s.quoteType || '주식'}
                                            </span>
                                        ) : (
                                            <>
                                                {freqText}
                                                {!isSuggestion &&
                                                    dd !== null &&
                                                    ' · D' + (dd >= 0 ? '-' : '+') + Math.abs(dd)}
                                            </>
                                        )}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
// ─────────────────────────────────────────────
// 6. WatchlistPanel
// ─────────────────────────────────────────────
function WatchlistPanel({ watchlist, selected, onSelect, onRemove }) {
    const freqLabel = { monthly: '월배당', quarterly: '분기', semiannual: '반기', annual: '연 1회', none: '비배당주' };

    if (watchlist.length === 0) {
        return (
            <aside className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-3 pt-1 min-w-0">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    관심 목록
                </h2>
                <div
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl
                bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-dashed border-slate-200/90 dark:border-slate-800/70
                shadow-lg shadow-black/5 py-10 px-4 text-center"
                >
                    <BookmarkPlus className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        위 검색창에서 티커를 검색해
                        <br />
                        관심 종목을 추가하세요.
                    </p>
                </div>
            </aside>
        );
    }

    return (
        <aside className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-2 pt-1 min-w-0">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                관심 목록 ({watchlist.length})
            </h2>
            <div className="flex flex-col gap-1.5">
                {watchlist.map((s) => {
                    const next = nextExDate(s);
                    const dd = next ? dDay(next.exDate) : null;
                    const isActive = selected && selected.ticker === s.ticker;
                    return (
                        <div
                            key={s.ticker}
                            className={
                                'group relative rounded-xl p-3 cursor-pointer border transition-all bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-lg shadow-black/5 ' +
                                (isActive
                                    ? 'border-orange-300/80 shadow-none dark:shadow-none'
                                    : 'border-slate-200/80 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-500')
                            }
                            onClick={() => onSelect(s)}
                        >
                            <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                    <p
                                        className={
                                            'text-sm font-bold leading-tight ' +
                                            (isActive
                                                ? 'text-slate-900 dark:text-white'
                                                : 'text-slate-800 dark:text-slate-100')
                                        }
                                    >
                                        {s.ticker}
                                    </p>
                                    <p
                                        className={
                                            'text-xs truncate ' +
                                            (isActive
                                                ? 'text-slate-600 dark:text-indigo-200'
                                                : 'text-slate-500 dark:text-slate-400')
                                        }
                                    >
                                        {s.displayName || s.name}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(s.ticker);
                                    }}
                                    className={
                                        'opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-md ' +
                                        (isActive
                                            ? 'hover:bg-indigo-500 text-indigo-200'
                                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400')
                                    }
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span
                                    className={
                                        'text-xs font-medium ' +
                                        (isActive
                                            ? 'text-indigo-700 dark:text-indigo-200'
                                            : 'text-slate-500 dark:text-slate-400')
                                    }
                                >
                                    {freqLabel[s.frequency]}
                                </span>
                                <span
                                    className={
                                        'text-sm font-bold ' +
                                        (isActive
                                            ? 'text-emerald-800 dark:text-emerald-300'
                                            : 'text-emerald-700 dark:text-emerald-400')
                                    }
                                >
                                    연 배당수익률 {s.dividendYield.toFixed(2)}%
                                </span>
                            </div>
                            {dd !== null && (
                                <div
                                    className={
                                        'mt-1.5 text-xs rounded-md px-2 py-0.5 inline-flex items-center gap-1 ' +
                                        (isActive
                                            ? 'bg-indigo-500/50 text-indigo-100'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400')
                                    }
                                >
                                    <CalendarDays className="w-3 h-3" />
                                    {dd === 0 ? '오늘 배당락!' : dd > 0 ? 'D-' + dd : Math.abs(dd) + '일 전'}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}

// ─────────────────────────────────────────────
// 7. StockInfoHeader
// ─────────────────────────────────────────────
function StockInfoHeader({ stock }) {
    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/60 p-4 sm:p-5 shadow-2xl shadow-black/10">
            <div className="flex flex-wrap items-start gap-x-4 sm:gap-x-6 gap-y-2">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center shadow-md flex-shrink-0"
                    >
                        <span className="text-white text-sm font-black">{stock.ticker.slice(0, 2)}</span>
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-black text-slate-900 dark:text-white">{stock.ticker}</h1>
                            <span
                                className={
                                    'px-2 py-0.5 rounded-full text-xs font-semibold ' +
                                    (stock.country === 'US'
                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                        : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300')
                                }
                            >
                                {stock.country === 'US' ? '🇺🇸 미국' : '🇰🇷 한국'}
                            </span>
                            <FreqBadge freq={stock.frequency} />
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {stock.displayName || stock.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{stock.sector}</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-3 ml-auto">
                    <MetricChip
                        label="현재가"
                        value={fmtNum(stock.currentPrice, stock.currency)}
                        icon={<DollarSign className="w-3.5 h-3.5" />}
                    />
                    <MetricChip
                        label="배당수익률 (연)"
                        value={stock.dividendYield.toFixed(2) + '%'}
                        icon={<Percent className="w-3.5 h-3.5" />}
                        highlight="emerald"
                    />
                    <MetricChip
                        label="연간 DPS (세전)"
                        value={fmtNum(stock.annualDPS, stock.currency)}
                        icon={<BarChart2 className="w-3.5 h-3.5" />}
                    />
                    <MetricChip
                        label="세율"
                        value={(stock.taxRate * 100).toFixed(1) + '%'}
                        icon={<Info className="w-3.5 h-3.5" />}
                        highlight="amber"
                    />
                </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-3">
                {stock.description}
            </p>
        </div>
    );
}

function MetricChip({ label, value, icon, highlight }) {
    const colorMap = {
        emerald: 'text-emerald-700 dark:text-emerald-400',
        amber: 'text-amber-700 dark:text-amber-400',
        red: 'text-red-600 dark:text-red-400',
    };
    const valueColor = colorMap[highlight] || 'text-slate-800 dark:text-slate-200';
    return (
        <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl
        bg-white/60 dark:bg-slate-800/70 backdrop-blur border border-slate-200/80 dark:border-slate-700/60 shadow-sm"
        >
            <span className="text-slate-400 dark:text-slate-500">{icon}</span>
            <div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">{label}</p>
                <p className={'text-sm font-bold leading-tight ' + valueColor}>{value}</p>
            </div>
        </div>
    );
}

function FreqBadge({ freq }) {
    const map = {
        monthly: { label: '월배당', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
        quarterly: { label: '분기배당', cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
        semiannual: { label: '반기배당', cls: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
        annual: { label: '연 1회', cls: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
        none: { label: '비배당주', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
    };
    const { label, cls } = map[freq] || map.none || map.annual;
    return <span className={'px-2 py-0.5 rounded-full text-xs font-semibold ' + cls}>{label}</span>;
}

// ─────────────────────────────────────────────
// 8. DividendTimeline
// ─────────────────────────────────────────────
function DividendTimeline({ stock }) {
    const years = [CURRENT_YEAR - 1, CURRENT_YEAR];
    const yearsDesc = [...years].sort((a, b) => b - a);
    const byYear = yearsDesc.map((year) => ({ year, months: Array.from({ length: 12 }, () => ({ ex: [], pay: [] })) }));

    stock.events.forEach((ev) => {
        const exDt = parseDate(ev.exDate);
        const payDt = parseDate(ev.payDate);

        byYear.forEach((row) => {
            if (exDt.getFullYear() === row.year) {
                row.months[exDt.getMonth()].ex.push(ev);
            }
            if (payDt.getFullYear() === row.year) {
                row.months[payDt.getMonth()].pay.push(ev);
            }
        });
    });

    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <CalendarDays className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {Math.min(...years)}~{Math.max(...years)}년 배당 타임라인
                </h2>
                <div className="ml-auto flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400" />
                        배당락일 (Ex)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                        지급일 (Pay)
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2.5 sm:gap-3">
                {byYear.map((row) => (
                    <div key={row.year} className="overflow-x-auto pb-1">
                        <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold">
                                {row.year}
                            </span>
                        </div>
                        <div className="flex gap-2 min-w-max">
                            {row.months.map((monthData, idx) => {
                                const isCurrentMonth = row.year === CURRENT_YEAR && idx === CURRENT_MONTH;
                                const hasEvent = monthData.ex.length > 0 || monthData.pay.length > 0;
                                return (
                                    <div
                                        key={row.year + '-' + idx}
                                        className={
                                            'flex-shrink-0 w-[88px] rounded-xl border transition-colors ' +
                                            (isCurrentMonth
                                                ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60')
                                        }
                                    >
                                        <div
                                            className={
                                                'text-center py-1.5 text-xs font-semibold rounded-t-xl ' +
                                                (isCurrentMonth
                                                    ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40'
                                                    : 'text-slate-500 dark:text-slate-400')
                                            }
                                        >
                                            {MONTH_SHORT[idx]}
                                            {isCurrentMonth && (
                                                <span className="ml-1 text-[9px] font-bold text-indigo-400">NOW</span>
                                            )}
                                        </div>

                                        <div className="p-1.5 flex flex-col gap-1 min-h-[96px]">
                                            {!hasEvent && (
                                                <div className="flex items-center justify-center h-full">
                                                    <span className="text-xs text-slate-300 dark:text-slate-600">
                                                        —
                                                    </span>
                                                </div>
                                            )}
                                            {monthData.ex.map((ev, i) => {
                                                const dd = dDay(ev.exDate);
                                                const isPast = dd < 0;
                                                return (
                                                    <div
                                                        key={'ex' + i}
                                                        className={
                                                            'rounded-lg px-1.5 py-1 ' +
                                                            (isPast
                                                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 opacity-55'
                                                                : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700')
                                                        }
                                                    >
                                                        <p className="text-[9px] font-bold text-red-600 dark:text-red-400">
                                                            EX-DATE
                                                        </p>
                                                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                                                            {fmtMD(ev.exDate)}
                                                        </p>
                                                        <p className="text-[9px] text-red-500 dark:text-red-400">
                                                            {fmtNum(ev.dps, stock.currency)}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                            {monthData.pay.map((ev, i) => {
                                                const isPast = dDay(ev.payDate) < 0;
                                                return (
                                                    <div
                                                        key={'pay' + i}
                                                        className={
                                                            'rounded-lg px-1.5 py-1 ' +
                                                            (isPast
                                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 opacity-55'
                                                                : 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700')
                                                        }
                                                    >
                                                        <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                                            PAY-DATE
                                                        </p>
                                                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                                            {fmtMD(ev.payDate)}
                                                        </p>
                                                        <p className="text-[9px] text-emerald-500 dark:text-emerald-400">
                                                            {fmtNum(ev.dps, stock.currency)}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 9. DividendTable
// ─────────────────────────────────────────────
function DividendTable({ stock }) {
    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {CURRENT_YEAR}년 배당 상세 일정
                </h2>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">총 {stock.events.length}회</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80">
                            {['#', '배당락일 (Ex-Date)', '지급일 (Pay-Date)', 'DPS', '상태'].map((h) => (
                                <th
                                    key={h}
                                    className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {[...stock.events]
                            .sort((a, b) => new Date(b.exDate) - new Date(a.exDate))
                            .map((ev, i) => {
                                const exDd = dDay(ev.exDate);
                                const payDd = dDay(ev.payDate);
                                const exPast = exDd < 0;
                                const payPast = payDd < 0;
                                let status, statusCls;
                                if (payPast) {
                                    status = '지급 완료';
                                    statusCls = 'text-slate-400 dark:text-slate-500';
                                } else if (exPast) {
                                    status = '지급 대기';
                                    statusCls = 'text-amber-600 dark:text-amber-400';
                                } else if (exDd === 0) {
                                    status = '오늘 배당락!';
                                    statusCls = 'text-orange-600 font-bold';
                                } else {
                                    status = 'D-' + exDd;
                                    statusCls = 'text-indigo-600 dark:text-indigo-400 font-semibold';
                                }
                                return (
                                    <tr
                                        key={i}
                                        className={
                                            'hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ' +
                                            (payPast ? 'opacity-50' : '')
                                        }
                                    >
                                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                                            {stock.events.length - i}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={
                                                    'font-semibold ' +
                                                    (exPast ? 'text-slate-400' : 'text-red-600 dark:text-red-400')
                                                }
                                            >
                                                {ev.exDate}
                                            </span>
                                            {!exPast && exDd > 0 && (
                                                <span className="ml-1.5 text-xs text-slate-400">D-{exDd}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={
                                                    'font-semibold ' +
                                                    (payPast
                                                        ? 'text-slate-400'
                                                        : 'text-emerald-600 dark:text-emerald-400')
                                                }
                                            >
                                                {ev.payDate}
                                            </span>
                                            {!payPast && payDd > 0 && (
                                                <span className="ml-1.5 text-xs text-slate-400">D-{payDd}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                                            {fmtNum(ev.dps, stock.currency)}
                                        </td>
                                        <td className={'px-4 py-3 text-xs ' + statusCls}>{status}</td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 10. DividendCalculator
// ─────────────────────────────────────────────
function DividendCalculator({ stock, exchangeRate = DEFAULT_EXCHANGE_RATE }) {
    const [shares, setShares] = useState('');
    const sharesNum = parseFloat(shares) || 0;

    const inferredCountByFreq = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1, none: 1 };
    const annualCount = stock.events.length > 0 ? stock.events.length : inferredCountByFreq[stock.frequency] || 1;

    const derivedAnnualDps =
        stock.annualDPS && stock.annualDPS > 0
            ? stock.annualDPS
            : stock.currentPrice && stock.dividendYield
              ? (stock.currentPrice * stock.dividendYield) / 100
              : 0;

    const rate = exchangeRate ?? DEFAULT_EXCHANGE_RATE;
    const rateLabel = exchangeRate != null ? rate.toLocaleString() : `${rate.toLocaleString()} (기본)`;

    const annualGross = sharesNum * derivedAnnualDps;
    const annualTax = annualGross * stock.taxRate;
    const annualNet = annualGross - annualTax;
    const perPayment = annualCount > 0 ? annualNet / annualCount : 0;
    const annualNetKRW = toKRW(annualNet, stock.currency, rate);

    const nextEv = nextExDate(stock);
    const nextPayGross = nextEv ? sharesNum * nextEv.dps : 0;
    const nextPayNet = nextPayGross * (1 - stock.taxRate);
    const nextPayKRW = toKRW(nextPayNet, stock.currency, rate);

    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <DollarSign className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">세후 배당금 계산기</h2>
                {stock.currency === 'USD' && (
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">환율 ₩{rateLabel}/USD</span>
                )}
            </div>

            <div className="flex items-center gap-3 mb-4">
                <label className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">보유 수량</label>
                <div
                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl
                    bg-white/60 dark:bg-slate-800/70 backdrop-blur border border-slate-200/80 dark:border-slate-700
          focus-within:ring-2 focus-within:ring-indigo-500 transition-all"
                >
                    <input
                        type="number"
                        min="0"
                        value={shares}
                        placeholder="0"
                        className="w-full bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-200
              outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        onChange={(e) => setShares(e.target.value)}
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                        {stock.currency === 'USD' ? '주' : '주/좌'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <CalcCard
                    label="연간 세전"
                    primary={sharesNum > 0 ? fmtNum(annualGross, stock.currency) : '—'}
                    secondary={sharesNum > 0 && stock.currency === 'USD' ? fmtKRW(annualGross * rate) : null}
                    sub={annualCount + '회 × ' + fmtNum(derivedAnnualDps / annualCount, stock.currency)}
                    color="slate"
                />
                <CalcCard
                    label={'세금 (' + (stock.taxRate * 100).toFixed(1) + '%)'}
                    primary={sharesNum > 0 ? '− ' + fmtNum(annualTax, stock.currency) : '—'}
                    sub={stock.country === 'US' ? '미국 원천징수' : '국내 배당소득세'}
                    color="amber"
                />
                <CalcCard
                    label="연간 세후 수령"
                    primary={sharesNum > 0 ? fmtNum(annualNet, stock.currency) : '—'}
                    secondary={sharesNum > 0 && stock.currency === 'USD' ? fmtKRW(annualNetKRW) : null}
                    sub={sharesNum > 0 ? '회당 ' + fmtNum(perPayment, stock.currency) : '수량 입력 후 계산'}
                    color="emerald"
                    highlight={sharesNum > 0}
                />
                <CalcCard
                    label="다음 회차 수령 예상"
                    primary={nextEv && sharesNum > 0 ? fmtNum(nextPayNet, stock.currency) : '—'}
                    secondary={nextEv && sharesNum > 0 && stock.currency === 'USD' ? fmtKRW(nextPayKRW) : null}
                    sub={nextEv ? '지급일 ' + nextEv.payDate : '해당 없음'}
                    color="indigo"
                />
            </div>
        </div>
    );
}

function CalcCard({ label, primary, secondary, sub, color, highlight }) {
    const map = {
        slate: {
            bg: 'bg-slate-50 dark:bg-slate-700/40',
            border: 'border-slate-200 dark:border-slate-700',
            val: 'text-slate-800 dark:text-slate-200',
        },
        amber: {
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            border: 'border-amber-200 dark:border-amber-800/40',
            val: 'text-amber-700 dark:text-amber-400',
        },
        emerald: {
            bg: 'bg-emerald-50 dark:bg-emerald-900/20',
            border: 'border-emerald-200 dark:border-emerald-800/40',
            val: 'text-emerald-700 dark:text-emerald-400',
        },
        indigo: {
            bg: 'bg-indigo-50 dark:bg-indigo-900/20',
            border: 'border-indigo-200 dark:border-indigo-800/40',
            val: 'text-indigo-700 dark:text-indigo-400',
        },
    };
    const c = map[color] || map.slate;
    return (
        <div
            className={
                'rounded-xl p-3 border ' +
                c.bg +
                ' ' +
                c.border +
                (highlight ? ' ring-1 ring-emerald-400 dark:ring-emerald-600' : '')
            }
        >
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
            <p className={'text-base font-bold ' + c.val}>{primary}</p>
            {secondary && <p className="text-xs text-slate-500 dark:text-slate-400">{secondary}</p>}
            {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─────────────────────────────────────────────
// 11. DpsBarChart
// ─────────────────────────────────────────────
function DpsBarChart({ stock }) {
    const { dark } = useTheme();
    const axisColor = dark ? '#94a3b8' : '#64748b';
    const gridColor = dark ? '#1e293b' : '#f1f5f9';
    const tooltipBg = dark ? '#0f172a' : '#ffffff';
    const tooltipBorder = dark ? '#1f2937' : '#e2e8f0';
    const tooltipText = dark ? '#e2e8f0' : '#1e293b';
    const tooltipSubText = dark ? '#818cf8' : '#6366f1';

    // 첫 배당 시점부터 최신 데이터까지 연속 시각화 (가능한 모든 이벤트 포함)
    const historyEvents = (stock.events || []).slice().sort((a, b) => parseDate(a.exDate) - parseDate(b.exDate));

    const data = historyEvents.map((ev, i) => ({
        label: `${i + 1}회 (${parseDate(ev.exDate).getFullYear()})`,
        net: parseFloat((ev.dps * (1 - stock.taxRate)).toFixed(4)),
    }));

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || !payload.length) return null;
        return (
            <div
                className="rounded-xl shadow-lg p-3 text-xs"
                style={{ background: tooltipBg, border: '1px solid ' + tooltipBorder, color: tooltipText }}
            >
                <p className="font-semibold mb-1">{label}</p>
                <p style={{ color: tooltipSubText }}>세후: {fmtNum(payload[0] && payload[0].value, stock.currency)}</p>
            </div>
        );
    };

    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">회차별 주당 배당금 (세후)</h2>
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={4} />
                    <YAxis
                        tick={{ fill: axisColor, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => fmtNum(v, stock.currency)}
                        width={65}
                    />
                    <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ stroke: dark ? '#94a3b8' : '#94a3b8', strokeDasharray: '3 3' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="net"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={false}
                        name="세후"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─────────────────────────────────────────────
// 12. FaqSection
// ─────────────────────────────────────────────
const FAQ_ITEMS = [
    // ── 기본 개념 ──────────────────────────────
    {
        q: '배당락일이란 무엇인가요?',
        a: '배당락일(Ex-Dividend Date)은 해당 날짜부터 주식을 매수해도 해당 배당금을 받을 수 없는 날입니다. 배당금을 받으려면 배당락일 하루 전까지 주식을 보유해야 합니다.',
    },
    {
        q: '배당수익률은 어떻게 계산하나요?',
        a: '배당수익률(%) = (연간 주당배당금 ÷ 현재 주가) × 100 으로 계산합니다. 예를 들어 주가가 10만 원이고 연간 배당금이 3,000원이면 배당수익률은 3%입니다.',
    },
    {
        q: '배당주란 무엇인가요?',
        a: '배당주는 보유 주주에게 정기적으로 배당금을 지급하는 주식입니다. 수익의 일부를 배당으로 환원하는 기업의 주식으로, 안정적인 현금 흐름을 원하는 투자자에게 적합합니다. 대표적인 배당주로는 삼성전자, SCHD, JEPI, 코카콜라(KO), AT&T(T) 등이 있습니다.',
    },
    {
        q: '배당락일과 배당기준일의 차이는 무엇인가요?',
        a: '배당기준일(Record Date)은 배당금을 받을 주주를 확정하는 날이고, 배당락일(Ex-Dividend Date)은 그 하루 전 영업일입니다. 배당락일 이전에 매수해야 배당기준일에 주주로 등록됩니다.',
    },
    {
        q: '배당금 지급일은 배당락일로부터 얼마나 걸리나요?',
        a: '미국 주식은 보통 배당락일로부터 2~4주 후에 배당금이 지급됩니다. 한국 주식은 배당기준일 후 약 60~90일 이내에 지급되는 경우가 많습니다.',
    },
    // ── 세금 ──────────────────────────────
    {
        q: '미국 배당주 세금은 얼마인가요?',
        a: '미국 주식 배당금에는 미국 원천징수세 15%가 부과됩니다. 한국 거주자는 미·한 조세협약에 따라 15% 세율이 적용되며, 미국 세금과 한국 배당소득세가 중복 과세되지 않습니다.',
    },
    {
        q: '한국 주식 배당소득세는 얼마인가요?',
        a: '국내 주식 배당소득에는 배당소득세 14%와 지방소득세 1.4%, 합계 15.4%가 원천징수됩니다.',
    },
    {
        q: '배당금에 이중과세가 발생하지 않나요?',
        a: '한국 투자자가 미국 주식 배당금을 받을 때, 미국에서 15% 원천징수 후 국내에 송금됩니다. 한·미 조세협약에 의해 미국에서 낸 세금은 국내 세금에서 외국납부세액공제로 처리되므로 이중과세가 발생하지 않습니다.',
    },
    {
        q: '배당소득이 2,000만 원을 초과하면 어떻게 되나요?',
        a: '국내 거주자의 금융소득(이자+배당)이 연 2,000만 원을 초과하면 종합소득세 신고 대상이 됩니다. 초과분에 대해 다른 소득과 합산하여 6~45%의 누진세율로 과세되므로 고액 배당 투자자는 사전에 세금 계획이 필요합니다.',
    },
    // ── ETF 상품 ──────────────────────────────
    {
        q: 'SCHD는 얼마나 자주 배당금을 지급하나요?',
        a: 'SCHD(Schwab U.S. Dividend Equity ETF)는 분기마다 배당금을 지급합니다. 매년 3월·6월·9월·12월에 배당락일과 지급일이 돌아옵니다.',
    },
    {
        q: 'SCHD란 어떤 ETF인가요?',
        a: 'SCHD(Schwab U.S. Dividend Equity ETF)는 슈왑(Schwab)이 운용하는 미국 고배당 ETF로, 10년 이상 꾸준히 배당을 지급·성장시킨 미국 우량 기업 약 100개에 투자합니다. 분기배당이며 배당 성장성이 높아 장기 투자자에게 인기 있는 배당 ETF입니다.',
    },
    {
        q: 'JEPI와 JEPQ는 월배당인가요?',
        a: '네, JEPI(JPMorgan Equity Premium Income ETF)와 JEPQ(JPMorgan Nasdaq Equity Premium Income ETF)는 매월 배당금을 지급하는 월배당 ETF입니다.',
    },
    {
        q: 'JEPQ란 어떤 ETF인가요?',
        a: 'JEPQ(JPMorgan Nasdaq Equity Premium Income ETF)는 나스닥100 기업에 투자하면서 ELN(Equity-Linked Note) 기반 커버드콜 전략으로 매월 높은 배당금을 지급하는 ETF입니다. JEPI보다 기술주 비중이 높아 성장 잠재력과 높은 월배당을 동시에 추구합니다.',
    },
    {
        q: '커버드콜 ETF란 무엇인가요?',
        a: '커버드콜(Covered Call) ETF는 보유 주식에 대해 콜옵션을 매도하여 프리미엄 수익을 얻고 이를 배당으로 지급하는 ETF입니다. JEPI, JEPQ, QYLD, RYLD 등이 대표적입니다. 일반 ETF보다 배당수익률이 높지만, 주가 상승 시 수익이 제한되는 특성이 있습니다.',
    },
    {
        q: '월배당 ETF에는 어떤 종목이 있나요?',
        a: '대표적인 월배당 ETF로는 JEPI(JPMorgan Equity Premium Income), JEPQ(JPMorgan Nasdaq Equity Premium Income), QYLD(Global X Nasdaq 100 Covered Call), RYLD(Global X Russell 2000 Covered Call) 등이 있습니다. 모두 커버드콜 전략을 활용해 높은 월배당을 지급합니다.',
    },
    {
        q: 'VYM ETF는 어떤 특징이 있나요?',
        a: 'VYM(Vanguard High Dividend Yield ETF)은 뱅가드(Vanguard)가 운용하는 고배당 ETF로, 미국 고배당 주식 약 400개에 넓게 분산 투자합니다. 운용보수(0.06%)가 매우 낮고 안정적인 분기배당을 지급하여 장기 고배당 투자에 적합합니다.',
    },
    {
        q: 'QYLD ETF는 어떤 특징이 있나요?',
        a: 'QYLD(Global X Nasdaq 100 Covered Call ETF)는 나스닥100 전체를 보유하면서 콜옵션 전량을 매도하는 완전 커버드콜 전략으로 연 10~13% 수준의 높은 월배당을 지급합니다. 주가 상승 시 수익이 옵션 프리미엄으로 제한되는 특성이 있습니다.',
    },
    // ── 투자 전략 ──────────────────────────────
    {
        q: '배당재투자(DRIP)란 무엇인가요?',
        a: '배당재투자(DRIP, Dividend Reinvestment Plan)는 받은 배당금을 현금으로 받지 않고 같은 주식이나 ETF를 자동으로 재매수하는 방법입니다. 복리 효과를 통해 장기적으로 자산을 더 빠르게 성장시킬 수 있어 장기 투자자에게 유리한 전략입니다.',
    },
    {
        q: '배당주 투자의 장점은 무엇인가요?',
        a: '①정기적인 현금 흐름: 배당금을 통해 주가 등락과 무관하게 소득을 얻을 수 있습니다. ②복리 효과: 배당금을 재투자하면 장기간 복리로 자산이 성장합니다. ③심리적 안정: 배당수익률이 하락폭을 일부 완충해 주가 하락 시에도 안정감을 줍니다. ④인플레이션 방어: 배당 성장형 주식은 배당금이 매년 늘어나 인플레이션을 방어합니다.',
    },
    {
        q: '분기배당과 월배당 중 어느 것이 더 유리한가요?',
        a: '월배당 ETF(JEPI, JEPQ 등)는 배당수익률이 높고 현금 흐름이 잦아 생활비에 활용하기 좋습니다. 분기배당 ETF(SCHD, VYM 등)는 배당 성장률이 높고 주가 상승 여력이 커 장기 자산 증식에 유리합니다. 두 가지를 적절히 혼합하는 포트폴리오가 일반적으로 권장됩니다.',
    },
    {
        q: '고배당주에 투자할 때 주의할 점은 무엇인가요?',
        a: '①배당수익률이 지나치게 높은 주식(10% 이상)은 배당 지속 가능성을 반드시 확인해야 합니다. ②배당성향(Payout Ratio)이 100%를 초과하는 기업은 배당 삭감 위험이 있습니다. ③커버드콜 ETF는 주가 상승 시 수익이 제한됩니다. ④세금 부담을 사전에 계산해야 합니다.',
    },
    {
        q: '배당주 포트폴리오는 어떻게 구성하나요?',
        a: '①안정형: SCHD + VYM + DVY (분기배당 ETF 중심, 배당 성장 추구) ②수익형: JEPI + JEPQ + QYLD (월배당 ETF 중심, 높은 현금 흐름) ③혼합형: SCHD 40% + JEPI 30% + 개별주(삼성전자 등) 30% (성장+배당 균형). 개인 투자 목표, 세금 상황, 위험 허용 범위에 따라 비중을 조정하세요.',
    },
    {
        q: 'ETF 배당수익률은 어디서 확인하나요?',
        a: '배당의 민족에서 종목 코드를 검색하면 배당수익률, 최근 배당락일, 지급일, 주당배당금(DPS)을 실시간으로 확인할 수 있습니다. 또한 ETF 운용사 공식 웹사이트, Yahoo Finance, ETF.com 등에서도 확인 가능합니다.',
    },
    {
        q: '삼성전자 배당금은 어떻게 확인하나요?',
        a: '삼성전자(005930)는 2022년부터 분기 배당을 실시하고 있습니다. 배당의 민족에서 "삼성전자" 또는 "005930"을 검색하면 최근 배당락일, 배당금, 배당수익률을 바로 확인할 수 있습니다. 연간 총 배당금은 매년 1월 이사회에서 발표됩니다.',
    },
    {
        q: '미국 배당주와 한국 배당주 중 어느 것이 유리한가요?',
        a: '미국 배당주(SCHD, JEPI 등)는 배당수익률이 안정적이고, 달러 자산으로 환율 헤지 효과가 있으며 ETF 종류가 다양합니다. 한국 배당주(삼성전자 등)는 원화 투자로 환위험이 없고 거래가 간편합니다. 다만 한국 기업은 배당 성향이 상대적으로 낮아 수익률이 낮은 경우가 많습니다. 두 시장에 분산 투자하는 것이 일반적으로 권장됩니다.',
    },
];

// ─────────────────────────────────────────────
// 12-A. PopularStocksGuide
// ─────────────────────────────────────────────
const POPULAR_ETF_DATA = [
    {
        ticker: 'JEPI',
        nameKo: 'JPMorgan Equity Premium Income ETF',
        freq: '월배당',
        freqColor: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
        yieldRange: '약 7~9%',
        desc: 'S&P 500 기반 커버드콜(ELN) 전략으로 매월 안정적인 배당을 지급하는 고배당 ETF. 배당수익률이 높고 변동성이 낮아 은퇴 포트폴리오에 적합합니다.',
    },
    {
        ticker: 'JEPQ',
        nameKo: 'JPMorgan Nasdaq Equity Premium Income ETF',
        freq: '월배당',
        freqColor: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
        yieldRange: '약 9~12%',
        desc: '나스닥100 기반 커버드콜 전략으로 JEPI보다 높은 배당수익률을 제공하는 월배당 ETF. 기술주 성장성과 높은 배당을 함께 추구합니다.',
    },
    {
        ticker: 'SCHD',
        nameKo: 'Schwab U.S. Dividend Equity ETF',
        freq: '분기배당',
        freqColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
        yieldRange: '약 3.5~4.5%',
        desc: '미국 고배당 우량주에 투자하는 분기배당 ETF. 10년 이상 꾸준히 배당을 성장시킨 기업 중심으로 구성되어 배당 성장성이 뛰어납니다.',
    },
    {
        ticker: 'QYLD',
        nameKo: 'Global X Nasdaq 100 Covered Call ETF',
        freq: '월배당',
        freqColor: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
        yieldRange: '약 10~13%',
        desc: '나스닥100 전체를 보유하면서 콜옵션을 매도하는 완전 커버드콜 전략. 매우 높은 월배당을 지급하지만 주가 상승 수익은 제한됩니다.',
    },
    {
        ticker: 'VYM',
        nameKo: 'Vanguard High Dividend Yield ETF',
        freq: '분기배당',
        freqColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
        yieldRange: '약 2.8~3.5%',
        desc: '뱅가드에서 운용하는 미국 고배당 ETF. 400여 개 고배당 우량주에 넓게 분산 투자하며 낮은 운용 보수와 안정적인 배당이 특징입니다.',
    },
    {
        ticker: 'DVY',
        nameKo: 'iShares Select Dividend ETF',
        freq: '분기배당',
        freqColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
        yieldRange: '약 4~6%',
        desc: '배당수익률 상위 100개 미국 주식으로 구성된 고배당 ETF. SCHD보다 높은 배당수익률을 제공하며 배당 지속성이 높은 기업 중심으로 구성됩니다.',
    },
];

const POPULAR_KR_DATA = [
    {
        ticker: '005930',
        name: '삼성전자',
        freq: '분기배당',
        freqColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
        yieldRange: '약 2~3%',
        desc: '국내 최대 반도체·스마트폰 기업. 2022년부터 분기 배당을 실시해 매년 3·6·9·12월에 배당금을 지급합니다. 연간 총 배당금은 매년 1월 이사회에서 결정합니다.',
    },
    {
        ticker: '000660',
        name: 'SK하이닉스',
        freq: '연배당',
        freqColor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
        yieldRange: '약 0.5~1.5%',
        desc: '국내 2위 메모리 반도체 기업. AI 반도체 수혜주로 최근 주주환원을 강화 중입니다. 배당기준일은 매년 12월 말이며 이듬해 봄에 지급합니다.',
    },
    {
        ticker: '035420',
        name: 'NAVER',
        freq: '연배당',
        freqColor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
        yieldRange: '약 0.2~0.5%',
        desc: '국내 최대 포털·IT 기업. 배당보다 성장 투자에 집중하는 정책이나 주주환원 강화 기조로 배당이 점진적으로 증가하는 추세입니다.',
    },
];

function PopularStocksGuide() {
    return (
        <section
            aria-label="인기 배당 ETF 및 배당주 가이드"
            className="max-w-screen-lg w-full mx-auto px-3 sm:px-6 pb-6"
        >
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
                인기 배당 ETF · 배당주 가이드
            </h2>
            <h3 className="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2 px-1">
                미국 배당 ETF – JEPI · JEPQ · SCHD · QYLD · VYM · DVY
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
                {POPULAR_ETF_DATA.map((s) => (
                    <article
                        key={s.ticker}
                        className="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-sm p-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-base font-black text-slate-900 dark:text-white">{s.ticker}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.freqColor}`}>
                                {s.freq}
                            </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{s.nameKo}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">{s.desc}</p>
                        <p className="text-xs text-orange-500 font-semibold">배당수익률 {s.yieldRange}</p>
                    </article>
                ))}
            </div>
            <h3 className="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2 px-1">
                한국 배당주 – 삼성전자 · SK하이닉스 · NAVER
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {POPULAR_KR_DATA.map((s) => (
                    <article
                        key={s.ticker}
                        className="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-sm p-4"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-base font-black text-slate-900 dark:text-white">{s.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.freqColor}`}>
                                {s.freq}
                            </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{s.ticker}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">{s.desc}</p>
                        <p className="text-xs text-orange-500 font-semibold">배당수익률 {s.yieldRange}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}

function FaqSection() {
    const [openIdx, setOpenIdx] = React.useState(null);
    return (
        <section aria-label="자주 묻는 질문" className="max-w-screen-lg w-full mx-auto px-3 sm:px-6 pb-6">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
                자주 묻는 질문 (FAQ)
            </h2>
            <div className="flex flex-col gap-2">
                {FAQ_ITEMS.map((item, idx) => {
                    const isOpen = openIdx === idx;
                    return (
                        <div
                            key={idx}
                            className="rounded-xl border border-slate-200/80 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-sm overflow-hidden"
                        >
                            <button
                                onClick={() => setOpenIdx(isOpen ? null : idx)}
                                aria-expanded={isOpen}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                                <span>{item.q}</span>
                                <span
                                    className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                >
                                    ▾
                                </span>
                            </button>
                            {isOpen && (
                                <div className="px-4 pb-4 pt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                                    {item.a}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────
// 13. EmptyState
// ─────────────────────────────────────────────
function EmptyState({ onPickTicker }) {
    return (
        <div className="flex-1">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 shadow-sm p-8">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                        <Search className="w-6 h-6" />
                    </div>
                    <div className="flex-1 space-y-2">
                        <div>
                            <p className="text-xs uppercase tracking-[0.08em] text-slate-400">Getting Started</p>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                실시간 티커 검색으로 바로 시작하세요
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                클라우드플레어 대시보드처럼 깔끔한 카드 뷰에서 배당락일, 지급일, DPS, 수익률을 한눈에
                                확인할 수 있습니다.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                '실시간 시세 / 배당 정보',
                                '이전·현재 연도 배당 일정',
                                '원/달러 자동 환산 및 세후 계산',
                            ].map((item) => (
                                <div
                                    key={item}
                                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                                >
                                    {item}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => document.querySelector('input[type="text"]')?.focus()}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 shadow-sm"
                            >
                                <Search className="w-4 h-4" />
                                티커 검색 시작하기
                            </button>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" /> 실시간 Yahoo Finance 데이터
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                            <span className="text-xs text-slate-400 w-full">추천 티커</span>
                            {PRESET_TICKERS.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => onPickTicker && onPickTicker(t)}
                                    className="px-3 py-1 rounded-full text-xs font-medium bg-white/70 dark:bg-slate-900/70 backdrop-blur border border-white/60 dark:border-slate-800/70 text-slate-700 dark:text-slate-200 hover:border-orange-300 dark:hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-300 transition-colors shadow-sm"
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 13-A. EtpHoldingsContainer
// ─────────────────────────────────────────────
function EtpHoldingsContainer({ stock, holdingsData, loading }) {
    const { dark } = useTheme();
    if (!stock || stock.quoteType !== 'ETF') return null;

    const holdings = holdingsData?.holdings || [];
    const source = holdingsData?.source || '';
    const hasError = holdingsData?.error && holdings.length === 0;
    const debugError = holdingsData?.debug_error || null;
    const isKR = stock.country === 'KR';

    const chartData = holdings.slice(0, 10).map((h) => ({
        name: h.name.length > 12 ? h.name.slice(0, 11) + '…' : h.name,
        weight: h.weight,
    }));

    const axisColor = dark ? '#94a3b8' : '#64748b';
    const tooltipBg = dark ? '#0f172a' : '#ffffff';
    const tooltipBorder = dark ? '#1f2937' : '#e2e8f0';
    const barColors = [
        '#6366f1',
        '#818cf8',
        '#818cf8',
        '#a5b4fc',
        '#a5b4fc',
        '#c7d2fe',
        '#c7d2fe',
        '#c7d2fe',
        '#c7d2fe',
        '#c7d2fe',
    ];

    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    구성종목{holdings.length > 0 ? ` (상위 ${holdings.length}개)` : ''}
                </h2>
                {source && (
                    <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {source}
                    </span>
                )}
            </div>

            {loading && !holdingsData && (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            )}

            {!loading && hasError && (
                <div className="flex flex-col items-center gap-2 text-sm text-slate-400 dark:text-slate-500 py-6 justify-center">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        구성종목 정보를 가져올 수 없습니다
                    </div>
                    {debugError && (
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 max-w-xs text-center break-all">
                            {debugError}
                        </p>
                    )}
                </div>
            )}

            {!loading && !holdingsData && (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            )}

            {holdings.length > 0 && (
                <>
                    {chartData.length > 0 && (
                        <div className="mb-4">
                            <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 26)}>
                                <BarChart
                                    layout="vertical"
                                    data={chartData}
                                    margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                                >
                                    <XAxis
                                        type="number"
                                        tick={{ fill: axisColor, fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => v + '%'}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={96}
                                        tick={{ fill: axisColor, fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        formatter={(v) => [v.toFixed(2) + '%', '비중']}
                                        contentStyle={{
                                            background: tooltipBg,
                                            border: '1px solid ' + tooltipBorder,
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                    />
                                    <Bar dataKey="weight" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                        {chartData.map((_, idx) => (
                                            <Cell key={idx} fill={barColors[idx] || '#c7d2fe'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
                                    <tr>
                                        {['#', '종목명', '티커', '비중']
                                            .concat(isKR ? ['보유주수', '평가금액(억)'] : [])
                                            .map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {holdings.map((h) => (
                                        <tr
                                            key={h.rank}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                        >
                                            <td className="px-3 py-2 text-slate-400 font-mono">{h.rank}</td>
                                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 max-w-[140px] truncate">
                                                {h.name}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">
                                                {h.ticker || '—'}
                                            </td>
                                            <td className="px-3 py-2 font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                                {h.weight.toFixed(2)}%
                                            </td>
                                            {isKR && (
                                                <>
                                                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                                                        {h.shares != null ? h.shares.toLocaleString() : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                                                        {h.value != null
                                                            ? Math.round(h.value / 1e8).toLocaleString()
                                                            : '—'}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// 13. StockDetailView
// ─────────────────────────────────────────────
function StockDetailView({ stock, exchangeRate = DEFAULT_EXCHANGE_RATE, holdingsData, loadingHoldings }) {
    return (
        <div className="flex-1 w-full flex flex-col gap-4 min-w-0">
            <StockInfoHeader stock={stock} />
            <EtpHoldingsContainer stock={stock} holdingsData={holdingsData} loading={loadingHoldings} />
            <DividendTimeline stock={stock} />
            <div className="flex flex-col gap-4">
                <DpsBarChart stock={stock} />
                <DividendCalculator stock={stock} exchangeRate={exchangeRate} />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 14. App Root
// ─────────────────────────────────────────────
function DashboardApp() {
    const { dark, toggle } = useTheme();

    const [liveCache, setLiveCache] = useState(() => {
        try {
            const storedV = Number(localStorage.getItem('dm-cache-v') || '0');
            if (storedV < CACHE_VERSION) {
                localStorage.removeItem('dm-live-cache');
                localStorage.removeItem('dm-watchlist');
                localStorage.setItem('dm-cache-v', String(CACHE_VERSION));
                return {};
            }
            return JSON.parse(localStorage.getItem('dm-live-cache') || '{}');
        } catch (_) {
            return {};
        }
    });

    const savedTickersRef = useRef([]);
    const cachedAtLoadRef = useRef({});
    const hydratedRef = useRef(false);

    const [watchlist, setWatchlist] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('dm-watchlist') || '[]');
            savedTickersRef.current = Array.isArray(saved) ? saved : [];
            const cache = (() => {
                try {
                    return JSON.parse(localStorage.getItem('dm-live-cache') || '{}');
                } catch (e) {
                    return {};
                }
            })();
            cachedAtLoadRef.current = cache;
            return savedTickersRef.current.map((t) => cache[t]).filter(Boolean);
        } catch (_) {
            savedTickersRef.current = [];
            cachedAtLoadRef.current = {};
            return [];
        }
    });

    const [selected, setSelected] = useState(null);
    const [loadingSymbol, setLoadingSymbol] = useState(null);
    const [exchangeRate, setExchangeRate] = useState(null);
    const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState(null);
    const [etpHoldings, setEtpHoldings] = useState({});
    const [loadingHoldings, setLoadingHoldings] = useState(false);
    const etpHoldingsFetchedRef = useRef(new Set());

    // 한국 종목·ETF 목록 (fetchLiveStock + SearchBar 공유)
    const [krStocks, setKrStocks] = useState([]);
    const [krEtfs, setKrEtfs] = useState([]);
    const [krDataReady, setKrDataReady] = useState(false);
    useEffect(() => {
        Promise.all([
            fetch('/api/kr-stocks')
                .then((r) => (r.ok ? r.json() : []))
                .then((data) => (Array.isArray(data) ? data : []))
                .catch(() => []),
            fetch('/api/kr-etfs')
                .then((r) => (r.ok ? r.json() : []))
                .then((data) => (Array.isArray(data) ? data : []))
                .catch(() => []),
        ]).then(([stocks, etfs]) => {
            setKrStocks(stocks);
            setKrEtfs(etfs);
            setKrDataReady(true);
        });
    }, []);

    const inferFrequency = (events, fallbackYield, country, ticker, quoteType) => {
        // 명백한 무배당 종목만 overrides (최소화)
        const nonDividendOverrides = new Set(['GLD', 'GLD.AX', 'IAU', 'SLV', 'BTC-USD']);
        if (nonDividendOverrides.has(ticker)) return 'none';

        const count = events.length;
        const yieldPct = Number(fallbackYield) || 0;
        const totalDps = events.reduce((sum, ev) => sum + (Number(ev.dps) || 0), 0);
        const maxDps = events.reduce((m, ev) => Math.max(m, Number(ev.dps) || 0), 0);

        // KR 종목은 Yahoo가 yield를 0으로 내려도 이벤트가 있으면 비배당 아님
        const isKR = country === 'KR' || ticker.endsWith('.KS') || ticker.endsWith('.KQ');
        const effectiveNoneDivThreshold = isKR ? 0 : 0.01;

        if (count === 0 && yieldPct < effectiveNoneDivThreshold && totalDps === 0 && maxDps <= 0.0001) {
            return 'none';
        }

        // ── Phase 1: 이벤트 간 날짜 GAP 기반 추론 (3건 이상일 때 우선 적용) ──
        if (count >= 3) {
            const sorted = [...events].sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
            const gaps = [];
            for (let i = 1; i < sorted.length; i++) {
                const diff = (new Date(sorted[i].exDate) - new Date(sorted[i - 1].exDate)) / (1000 * 60 * 60 * 24);
                if (diff > 0) gaps.push(diff);
            }
            if (gaps.length > 0) {
                const sorted_gaps = [...gaps].sort((a, b) => a - b);
                const mid = Math.floor(sorted_gaps.length / 2);
                const median =
                    sorted_gaps.length % 2 === 1 ? sorted_gaps[mid] : (sorted_gaps[mid - 1] + sorted_gaps[mid]) / 2;

                if (median <= 45) return 'monthly';
                if (median <= 105) return 'quarterly';
                if (median <= 200) return 'semiannual';
                return 'annual';
            }
        }

        // ── Phase 2: count/span 기반 추론 (fallback) ──
        const years = events.map((e) => parseDate(e.exDate).getFullYear()).filter((y) => !Number.isNaN(y));
        if (years.length > 0) {
            const minY = Math.min(...years);
            const maxY = Math.max(...years);
            const span = Math.max(1, maxY - minY + 1);
            const perYear = count / span;
            if (perYear >= 9.0) return 'monthly';
            if (perYear >= 3.0) return 'quarterly';
            if (perYear >= 1.5) return 'semiannual';
        }

        // 단일연도: count만으로 판단
        if (count >= 10) return 'monthly';
        if (count >= 4) return 'quarterly';
        if (count >= 2) return 'semiannual';

        // ETF/펀드/주식 기본 추정
        if (yieldPct >= 0.01) {
            if (quoteType === 'ETF' || quoteType === 'MUTUALFUND') return 'quarterly';
            if (country === 'US') return 'quarterly';
        }

        return 'annual';
    };

    const normalizeKRSymbol = (s) => {
        let sym = s.trim().toUpperCase();
        if (/^KRX:/i.test(sym)) sym = sym.replace(/^KRX:/i, '');
        if (/^[0-9]{6}$/.test(sym)) return `${sym}.KS`;
        return sym;
    };

    const normalizeSymbol = (raw) => normalizeKRSymbol(raw);

    const extractSixDigit = (s) => {
        const m = (s || '').match(/(\d{6})/);
        return m ? m[1] : null;
    };

    const parseKsdDate = (raw) => {
        if (!raw) return null;
        const s = String(raw).trim();
        if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return null;
    };

    const pickXmlText = (node, tags) => {
        for (const t of tags) {
            const el = node.getElementsByTagName(t)[0];
            const val = el && el.textContent ? el.textContent.trim() : '';
            if (val) return val;
        }
        return '';
    };

    const fetchKsdDividends = async (symbol) => {
        if (typeof window === 'undefined' || !window.DOMParser) return [];

        const today = new Date();
        const baseDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        const baseSix = extractSixDigit(symbol) || '';
        const variants = [baseSix, baseSix.replace(/^0+/, ''), baseSix.replace(/^0+/, '').replace(/0+$/, '')].filter(
            (v) => v && /\d+/.test(v),
        );
        const candidates = Array.from(new Set(variants));
        if (candidates.length === 0) return [];

        for (const issucoCustno of candidates) {
            try {
                const params = new URLSearchParams({
                    issucoCustno,
                    rgtStdDt: baseDate,
                });

                const res = await fetch(`/api/ksd-dividends?${params.toString()}`);
                if (!res.ok) continue;
                const xmlText = await res.text();
                if (!xmlText) continue;

                const xml = new window.DOMParser().parseFromString(xmlText, 'text/xml');
                const totalCount = Number(xml.getElementsByTagName('totalCount')[0]?.textContent || 0);
                const items = Array.from(xml.getElementsByTagName('item') || []);
                if (!totalCount || items.length === 0) continue;

                const parsed = items
                    .map((item) => {
                        const exRaw =
                            pickXmlText(item, ['cashDvdnRcdDt', 'dvdnRcdDt', 'rgtStdDt', 'dvdnBasDt', 'basDt']) ||
                            baseDate;
                        const payRaw = pickXmlText(item, ['cashDvdnPayDt', 'dvdnPayDt', 'payDt', 'cashDvdnPayDe']);
                        const dpsRaw = pickXmlText(item, ['cashDvdnPayAmt', 'cashDvdnAmt', 'dvdnAmt', 'dvdnRate']);
                        const exDate = parseKsdDate(exRaw) || parseKsdDate(baseDate);
                        const payDate = parseKsdDate(payRaw) || exDate || parseKsdDate(baseDate);
                        const dps = Number(dpsRaw);
                        if (!exDate || !payDate || Number.isNaN(dps)) return null;
                        return { exDate, payDate, dps };
                    })
                    .filter(Boolean)
                    .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

                if (parsed.length > 0) return parsed;
            } catch (err) {
                console.warn('KSD fetch failed', err);
            }
        }

        return [];
    };

    const fetchLiveStock = useCallback(
        async (symbolInput) => {
            const raw = symbolInput.trim();
            const normalized = normalizeSymbol(raw);
            if (!normalized) throw new Error('티커를 입력하세요');

            let resolvedSymbol = normalized;
            let krShortName = null;
            let krLongName = null;

            // ── CSV 로컬 선행 조회: 6자리 코드 기반 한글명 확보 ──
            const csvSixDigit = extractSixDigit(raw) || extractSixDigit(normalized);
            if (csvSixDigit) {
                const csvMatch = [...krStocks, ...krEtfs].find((s) => s.code === csvSixDigit);
                if (csvMatch) {
                    krShortName = csvMatch.shortName || csvMatch.name || null;
                    krLongName = csvMatch.name || null;
                }
            }
            if (/[가-힣]/.test(raw) || /\s/.test(raw)) {
                try {
                    const searchRes = await fetch(`/api/search?q=${encodeURIComponent(raw)}&lang=ko-KR&region=KR`);
                    if (searchRes.ok) {
                        const data = await searchRes.json();
                        const picks = (data.quotes || []).filter((q) => q.symbol && q.quoteType !== 'CRYPTOCURRENCY');
                        const ranked = picks.sort((a, b) => {
                            const score = (q) => {
                                const sym = q.symbol?.toUpperCase() || '';
                                const ex = (q.exchDisp || q.exchange || '').toUpperCase();
                                let s = 0;
                                if (/\.KS$/.test(sym) || ex.includes('KSC') || ex.includes('KOSPI')) s += 3;
                                if (/\.KQ$/.test(sym) || ex.includes('KOSDAQ')) s += 2;
                                if (/^[0-9]{6}$/.test(sym) || sym.includes('KRX')) s += 1.5;
                                return s;
                            };
                            return score(b) - score(a);
                        });
                        const cand = ranked[0];
                        if (cand && cand.symbol) {
                            resolvedSymbol = normalizeSymbol(cand.symbol);
                            krShortName = cand.shortname || null;
                            krLongName = cand.longname || null;
                        }
                    }
                } catch (_) {}
            }

            const codeCandidate = extractSixDigit(raw) || extractSixDigit(normalized);
            const symbolCandidates = [];
            const pushCandidate = (sym) => {
                if (!sym) return;
                const cleaned = sym.trim().toUpperCase();
                if (!/[A-Z0-9]/.test(cleaned)) return;
                if (!symbolCandidates.includes(cleaned)) symbolCandidates.push(cleaned);
            };

            pushCandidate(resolvedSymbol);
            if (resolvedSymbol.endsWith('.KS')) pushCandidate(resolvedSymbol.replace(/\.KS$/, '.KQ'));
            if (resolvedSymbol.endsWith('.KQ')) pushCandidate(resolvedSymbol.replace(/\.KQ$/, '.KS'));
            if (codeCandidate) {
                pushCandidate(`${codeCandidate}.KS`);
                pushCandidate(`${codeCandidate}.KQ`);
            }

            let quote = null;
            for (const sym of symbolCandidates) {
                const quoteRes = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
                if (!quoteRes.ok) continue;
                quote = await quoteRes.json();
                resolvedSymbol = sym;
                break;
            }
            if (!quote) throw new Error('실시간 시세 조회 실패');

            const sd = quote._summaryDetail ?? {};
            const ce = quote._calendarEvents ?? {};
            const currencyGuess = sd.currency || quote.currency || (resolvedSymbol.endsWith('.KS') ? 'KRW' : 'USD');
            const currency = currencyGuess || 'USD';
            const price =
                quote.regularMarketPrice ??
                sd.regularMarketPreviousClose ??
                sd.previousClose ??
                quote.postMarketPrice ??
                quote.bid ??
                quote.ask ??
                quote.previousClose ??
                0;
            let annualDPS = sd.dividendRate ?? sd.trailingAnnualDividendRate ?? quote.trailingAnnualDividendRate ?? 0;
            const rawYield =
                sd.dividendYield ??
                sd.yield ??
                sd.trailingAnnualDividendYield ??
                quote.trailingAnnualDividendYield ??
                null;
            // yahoo-finance2는 소수(0.05 = 5%) 반환 → 항상 *100
            let dividendYield = rawYield != null ? rawYield * 100 : price && annualDPS ? (annualDPS / price) * 100 : 0;
            const baseName = quote.longName || quote.shortName || quote.symbol || resolvedSymbol.toUpperCase();
            const country = currency === 'KRW' ? 'KR' : 'US';
            const displayName =
                country === 'KR'
                    ? krShortName || quote.shortName || krLongName || baseName || resolvedSymbol.toUpperCase()
                    : baseName;
            const fullName = krLongName || baseName || displayName;
            const name = displayName;
            const baseSymbol = normalized;
            const taxRate = country === 'KR' ? 0.154 : 0.15;

            // KR 종목인데 한글명이 아직 없으면 6자리 코드로 검색해서 한글명 취득
            if (country === 'KR' && !krShortName && !krLongName) {
                try {
                    const sixDigit = resolvedSymbol.replace(/\.(KS|KQ)$/i, '');
                    const krRes = await fetch(`/api/search?q=${encodeURIComponent(sixDigit)}&lang=ko-KR&region=KR`);
                    if (krRes.ok) {
                        const krData = await krRes.json();
                        const krMatch = (krData.quotes || []).find(
                            (q) =>
                                normalizeSymbol(q.symbol) === resolvedSymbol ||
                                q.symbol?.replace(/^KRX:/i, '') + '.KS' === resolvedSymbol,
                        );
                        if (krMatch) {
                            krShortName = krMatch.shortname || null;
                            krLongName = krMatch.longname || null;
                        }
                    }
                } catch (_) {}
            }

            const aliases = [
                displayName,
                fullName,
                quote.shortName,
                quote.longName,
                quote.symbol,
                quote.quoteType,
                symbolInput,
                baseSymbol.replace(/\.KS$/, ''),
                baseSymbol.replace(/\.KQ$/, ''),
                resolvedSymbol,
                krShortName,
                krLongName,
            ]
                .map((v) => (v == null ? '' : v.toString().trim()))
                .filter((v) => v.length > 0);
            const quoteType = quote.quoteType || '';
            const sector = quote.market || quoteType || 'N/A';

            let events = [];
            if (country === 'KR') {
                try {
                    events = await fetchKsdDividends(resolvedSymbol);
                } catch (err) {
                    console.warn('KSD dividend fetch failed', err);
                }
            }

            if (events.length === 0) {
                try {
                    const divRes = await fetch(
                        `/api/dividends?symbol=${encodeURIComponent(resolvedSymbol)}&from=1990-01-01`,
                    );
                    if (divRes.ok) {
                        const divs = await divRes.json();
                        events = (divs || [])
                            .map((ev) => {
                                const dt = new Date(ev.date || ev.exDate || ev.payDate || Date.now());
                                const exDate = dt.toISOString().slice(0, 10);
                                const payDate = ev.payDate ? String(ev.payDate).slice(0, 10) : exDate;
                                const dps = Number(ev.amount ?? ev.dividends ?? ev.cash ?? ev.value ?? 0);
                                return { exDate, payDate, dps };
                            })
                            .filter((ev) => !Number.isNaN(ev.dps))
                            .sort((a, b) => new Date(a.exDate) - new Date(b.exDate));
                    }
                } catch (err) {
                    console.warn('dividend fetch failed', err);
                }
            }

            if (events.length === 0) {
                // quoteSummary는 Date 객체 반환, quote()는 Unix초 반환 → 양쪽 처리
                const toDate = (v) => {
                    if (!v) return null;
                    if (v instanceof Date) return v;
                    const n = Number(v);
                    return n > 1e9 ? new Date(n * 1000) : new Date(v);
                };
                const exDivRaw = sd.exDividendDate ?? ce.exDividendDate ?? quote.exDividendDate;
                const payRaw = ce.dividendDate ?? quote.dividendDate;
                const exDiv = toDate(exDivRaw);
                const pay = toDate(payRaw);
                if (exDiv && !isNaN(exDiv.getTime())) {
                    const exDate = exDiv.toISOString().slice(0, 10);
                    const payDate = pay ? pay.toISOString().slice(0, 10) : exDate;
                    events = [{ exDate, payDate, dps: Number(annualDPS) || 0 }];
                }
            }

            // 국내 종목 등 배당 정보가 비어있을 때 이벤트 기반으로 DPS/Yield 추론
            if (annualDPS <= 0 && events.length > 0) {
                const now = new Date();
                const last12 = events.filter((ev) => {
                    const dt = parseDate(ev.exDate);
                    return now - dt <= 365 * 24 * 60 * 60 * 1000 && now >= dt;
                });
                const sum = (last12.length > 0 ? last12 : events).reduce((acc, ev) => acc + (Number(ev.dps) || 0), 0);
                annualDPS = sum;
            }
            if (dividendYield <= 0 && price && annualDPS) {
                dividendYield = (annualDPS / price) * 100;
            }

            const frequency = inferFrequency(
                events,
                dividendYield,
                country,
                (quote.symbol || resolvedSymbol).toUpperCase(),
                quoteType,
            );

            const description =
                country === 'KR'
                    ? `${fullName || name} · 한국예탁결제원 배당정보 + Yahoo Finance`
                    : `${name} · Yahoo Finance 실시간 데이터`;

            return {
                ticker: (quote.symbol || resolvedSymbol).toUpperCase(),
                name,
                displayName: name,
                fullName,
                aliases,
                country,
                currency,
                quoteType,
                currentPrice: Number(price) || 0,
                dividendYield: Number(dividendYield.toFixed(2)),
                annualDPS: Number(annualDPS) || 0,
                frequency,
                taxRate,
                sector,
                description,
                events,
            };
        },
        [krStocks, krEtfs],
    );

    const fetchExchangeRate = useCallback(async () => {
        const tryFetch = async (url, extract) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('fx fetch failed');
            let data = null;
            try {
                data = await res.json();
            } catch (_) {
                return null;
            }
            const val = extract(data);
            const next = Number(val);
            if (Number.isFinite(next) && next > 0) return next;
            return null;
        };

        const pipelines = [
            () => tryFetch('https://api.exchangerate.host/latest?base=USD&symbols=KRW', (d) => d?.rates?.KRW),
            () => tryFetch('https://open.er-api.com/v6/latest/USD', (d) => d?.rates?.KRW),
        ];

        for (const fn of pipelines) {
            try {
                const rate = await fn();
                if (Number.isFinite(rate) && rate > 0) {
                    setExchangeRate(rate);
                    setExchangeRateUpdatedAt(new Date().toISOString());
                    return rate;
                }
            } catch (err) {
                console.warn('exchange rate fetch failed', err);
            }
        }
        return null;
    }, []);

    const handleFetchLive = useCallback(
        async (symbolInput) => {
            const symbol = symbolInput.trim();
            if (!symbol) return;
            setLoadingSymbol(symbol);
            try {
                const stock = await fetchLiveStock(symbol);
                if (!stock) return;
                await fetchExchangeRate();
                setLiveCache((prev) => ({ ...prev, [stock.ticker]: stock }));
                setWatchlist((prev) => {
                    const exists = prev.find((s) => s.ticker === stock.ticker);
                    if (exists) return prev.map((s) => (s.ticker === stock.ticker ? stock : s));
                    return [...prev, stock];
                });
                setSelected(stock);
            } catch (err) {
                console.error(err);
                alert('실시간 조회 실패: ' + err.message);
            } finally {
                setLoadingSymbol(null);
            }
        },
        [fetchLiveStock, fetchExchangeRate],
    );

    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const missing = savedTickersRef.current.filter((t) => !cachedAtLoadRef.current[t]);
        if (missing.length === 0) return;
        missing.forEach((t, idx) => {
            setTimeout(() => handleFetchLive(t), idx * 200);
        });
    }, [handleFetchLive]);

    useEffect(() => {
        localStorage.setItem('dm-watchlist', JSON.stringify(watchlist.map((s) => s.ticker)));
    }, [watchlist]);

    useEffect(() => {
        localStorage.setItem('dm-live-cache', JSON.stringify(liveCache));
    }, [liveCache]);

    const fetchHoldings = useCallback(async (stock) => {
        if (!stock || stock.quoteType !== 'ETF') return;
        const ticker = stock.ticker;
        if (etpHoldingsFetchedRef.current.has(ticker)) return;
        etpHoldingsFetchedRef.current.add(ticker);
        setLoadingHoldings(true);
        try {
            const isKR = stock.country === 'KR' || ticker.includes('.KS') || ticker.includes('.KQ');
            const country = isKR ? 'KR' : 'US';
            const m = ticker.match(/(\d{6})/);
            const symbol = isKR && m ? m[1] : ticker;
            const res = await fetch(`/api/holdings?symbol=${encodeURIComponent(symbol)}&country=${country}`);
            if (!res.ok) throw new Error('holdings fetch failed');
            const data = await res.json();
            if (data.debug_error) console.warn(`[holdings:${ticker}]`, data.debug_error);
            setEtpHoldings((prev) => ({ ...prev, [ticker]: data }));
        } catch (err) {
            console.warn('holdings fetch failed', err);
            etpHoldingsFetchedRef.current.delete(ticker);
            setEtpHoldings((prev) => ({ ...prev, [ticker]: { holdings: [], error: err.message } }));
        } finally {
            setLoadingHoldings(false);
        }
    }, []);

    useEffect(() => {
        if (!selected || selected.quoteType !== 'ETF') return;
        fetchHoldings(selected);
    }, [selected, fetchHoldings]);

    const handleSearch = useCallback((stock) => {
        setWatchlist((prev) => {
            if (prev.find((s) => s.ticker === stock.ticker)) return prev;
            return [...prev, stock];
        });
        setSelected(stock);
    }, []);

    useEffect(() => {
        fetchExchangeRate();
    }, [fetchExchangeRate]);

    const handleRemove = useCallback((ticker) => {
        setWatchlist((prev) => prev.filter((s) => s.ticker !== ticker));
        setSelected((prev) => (prev && prev.ticker === ticker ? null : prev));
    }, []);

    const rateDisplay = (exchangeRate ?? DEFAULT_EXCHANGE_RATE).toLocaleString();
    const rateSuffix = exchangeRate == null ? ' (기본)' : '';

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 relative overflow-hidden">
            <KakaoShareButton />
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-16 -left-16 w-60 h-60 bg-white/30 dark:bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-14 -right-14 w-64 h-64 bg-orange-200/30 dark:bg-amber-500/10 rounded-full blur-3xl" />
            </div>
            <header
                className="sticky top-0 z-40 bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl
            border-b border-slate-200/80 dark:border-slate-800/60 shadow-lg"
            >
                <div className="max-w-screen-lg w-full mx-auto px-3 sm:px-6 py-2.5 flex items-center gap-3 sm:gap-4">
                    <div
                        className="flex items-center gap-2.5 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => window.location.reload()}
                    >
                        <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center shadow-sm">
                            <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <div className="hidden sm:block leading-tight">
                            <p className="text-sm font-black text-slate-900 dark:text-white">배당의 민족</p>
                            <p className="text-[11px] font-semibold text-orange-500">Dividend Master</p>
                        </div>
                    </div>

                    <div className="flex-1 flex justify-center">
                        <SearchBar
                            onSelect={handleSearch}
                            onFetch={handleFetchLive}
                            liveCache={liveCache}
                            krStocks={krStocks}
                            krEtfs={krEtfs}
                            krDataReady={krDataReady}
                        />
                    </div>

                    <button
                        onClick={toggle}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  bg-white/70 dark:bg-slate-900/70 backdrop-blur border border-white/60 dark:border-slate-800/70 text-slate-700 dark:text-slate-300
                  hover:bg-orange-50/80 dark:hover:bg-slate-800 transition-colors shadow-sm"
                    >
                        {dark ? (
                            <Sun className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                            <Moon className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span className="hidden sm:inline">{dark ? '라이트' : '다크'}</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 max-w-screen-lg w-full mx-auto px-3 sm:px-6 py-3 sm:py-6 relative overflow-x-hidden">
                <div
                    className="absolute inset-0 rounded-[24px] bg-white/18 dark:bg-slate-900/18 blur-3xl"
                    aria-hidden
                />
                <div className="relative w-full max-w-full overflow-hidden rounded-[22px] border border-slate-200/80 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/55 backdrop-blur-2xl shadow-2xl shadow-black/10 p-3 sm:p-6">
                    <div className="flex w-full min-w-0 flex-col xl:flex-row gap-5 items-start">
                        <WatchlistPanel
                            watchlist={watchlist}
                            selected={selected}
                            onSelect={setSelected}
                            onRemove={handleRemove}
                        />
                        {selected ? (
                            <StockDetailView
                                stock={selected}
                                exchangeRate={exchangeRate}
                                holdingsData={etpHoldings[selected.ticker]}
                                loadingHoldings={loadingHoldings}
                            />
                        ) : (
                            <div className="flex-1">
                                <EmptyState onPickTicker={handleFetchLive} />
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* ── 카카오 애드핏 배너 ── */}
            <div className="flex justify-center py-3">
                <ins
                    className="kakao_ad_area"
                    style={{ display: 'none' }}
                    data-ad-unit="DAN-r8PXuWpA6HfKB4GQ"
                    data-ad-width="320"
                    data-ad-height="50"
                />
            </div>

            <PopularStocksGuide />

            <FaqSection />

            <footer className="border-t border-slate-200 dark:border-slate-800 py-3 px-6">
                <p className="text-center text-xs text-slate-400 dark:text-slate-600">
                    Dividend Master · 환율 ₩{rateDisplay}/USD{rateSuffix} · 기준일 {TODAY.toISOString().slice(0, 10)}
                </p>
            </footer>
        </div>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <DashboardApp />
        </ThemeProvider>
    );
}
