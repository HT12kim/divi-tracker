// ============================================================
//  Dividend Master – 티커 검색 & 배당 일정 조회
//  단일 파일 React 컴포넌트 (src/App.jsx)
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
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
    Factory,
    Share2,
} from 'lucide-react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
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
const getToday = () => new Date();
const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonth = () => new Date().getMonth();
const MONTH_SHORT = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// ─────────────────────────────────────────────
// 4. 유틸리티
// ─────────────────────────────────────────────
const toKRW = (amount, currency, rate = DEFAULT_EXCHANGE_RATE) => (currency === 'USD' ? amount * rate : amount);

const fmtKRW = (v) =>
    new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(v);

const fmtExchangeRate = (v) =>
    new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtUSD = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

const fmtNum = (v, currency) => (currency === 'USD' ? fmtUSD(v) : fmtKRW(v));

const parseDate = (s) => new Date(s);

const fmtMD = (s) => {
    const d = parseDate(s);
    return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
};

const dDay = (dateStr) => Math.ceil((parseDate(dateStr) - getToday()) / (1000 * 60 * 60 * 24));

const nextExDate = (stock) => {
    const futures = stock.events
        .filter((e) => parseDate(e.exDate) >= getToday())
        .sort((a, b) => parseDate(a.exDate) - parseDate(b.exDate));
    return futures[0] || null;
};

const FREQ_LABEL = { monthly: '월배당', quarterly: '분기', semiannual: '반기', annual: '연 1회', none: '비배당주' };

// ─────────────────────────────────────────────
// 4. Toast 시스템
// ─────────────────────────────────────────────
const ToastContext = createContext(null);

function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const addToast = useCallback((message, type = 'error') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    }, []);
    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={
                            'pointer-events-auto px-4 py-3 rounded-lg shadow-xl text-sm font-medium max-w-xs ' +
                            (t.type === 'error'
                                ? 'bg-red-600 text-white'
                                : 'bg-emerald-600 text-white')
                        }
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
};

// ─────────────────────────────────────────────
// 5. 테마 컨텍스트
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
            className="fixed bottom-[72px] left-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg
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
                      etfMarket: s.market,
                      etfAssetType: s.assetType,
                      etfTaxType: s.taxType,
                      etfListingType: s.listingType,
                      etfReplicationType: s.replicationType,
                      etfManager: s.manager,
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

    // 한글 입력 시: krDataReady가 false면 아직 CSV 로딩 중
    const isKrDataLoading = isKoreanQuery && isLocalSearch && !krDataReady;
    const hasDropdown =
        open && (mergedResults.length > 0 || loadingSuggest || errorSuggest || (isKoreanQuery && isLocalSearch));

    return (
        <div ref={wrapRef} className="relative w-full max-w-xl">
            <div className="dm-search-shell">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                    type="text"
                    value={query}
                    aria-label="배당주 티커 검색"
                    aria-expanded={hasDropdown}
                    aria-autocomplete="list"
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
                    className="dm-panel absolute top-full mt-2 left-0 right-0 z-50 overflow-hidden"
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
                        const freqText = isSuggestion ? s.quoteType || '검색 결과' : FREQ_LABEL[s.frequency] || '—';
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
                  hover:bg-orange-50/80 dark:hover:bg-slate-800 transition-colors
                  border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                                <div
                                    className="w-9 h-9 rounded-lg bg-slate-950 dark:bg-white
                  flex items-center justify-center flex-shrink-0"
                                >
                                    <span className="text-white dark:text-slate-950 text-xs font-bold">{s.ticker.slice(0, 2)}</span>
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
    // ...

    if (watchlist.length === 0) {
        return (
            <aside className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-3 pt-1 min-w-0">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    관심 목록
                </h2>
                <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg
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
            <ul className="flex flex-col gap-1.5" role="list">
                {watchlist.map((s) => {
                    const next = nextExDate(s);
                    const dd = next ? dDay(next.exDate) : null;
                    const isActive = selected && selected.ticker === s.ticker;
                    return (
                        <li key={s.ticker} className="relative group">
                            <button
                                type="button"
                                aria-pressed={isActive}
                                className={
                                    'w-full text-left rounded-lg p-3 border transition-all bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-lg shadow-black/5 ' +
                                    (isActive
                                        ? 'border-orange-300/80 shadow-none dark:shadow-none'
                                        : 'border-slate-200/80 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-500')
                                }
                                onClick={() => onSelect(s)}
                            >
                                <div className="flex items-start gap-1 pr-5">
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
                                        {FREQ_LABEL[s.frequency]}
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
                            </button>
                            <button
                                type="button"
                                aria-label={`${s.ticker} 삭제`}
                                onClick={() => onRemove(s.ticker)}
                                className={
                                    'absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-0.5 rounded-md ' +
                                    (isActive
                                        ? 'hover:bg-indigo-500 text-indigo-200'
                                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400')
                                }
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}

// ─────────────────────────────────────────────
// 7. StockInfoHeader
// ─────────────────────────────────────────────
function StockInfoHeader({ stock, mddData, loadingMdd }) {
    const shareUrl = `https://divi-tracker.netlify.app/?ticker=${encodeURIComponent(stock.ticker)}`;
    const name = stock.displayName || stock.name || stock.ticker;
    const yieldStr = stock.dividendYield ? stock.dividendYield.toFixed(2) + '%' : '';
    const shareText = `${name}(${stock.ticker}) 배당수익률 ${yieldStr}\n배당락일·배당금 실시간 조회`;
    const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: `${stock.ticker} 배당 정보`, text: shareText, url: shareUrl });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        window.open(threadsUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div>
            <div className="dm-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-x-4 sm:gap-x-6 gap-y-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="dm-brand-mark h-12 w-12">
                            <span className="text-white dark:text-slate-950 text-sm font-black">{stock.ticker.slice(0, 2)}</span>
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
                                    {stock.country === 'US' ? 'US 미국' : 'KR 한국'}
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
                            label="연간 DPS (세후)"
                            value={fmtNum(stock.annualDPS * (1 - (stock.taxRate ?? 0)), stock.currency)}
                            icon={<BarChart2 className="w-3.5 h-3.5" />}
                        />
                        {(() => {
                            const latest = stock.events?.length
                                ? [...stock.events].sort((a, b) => new Date(b.exDate) - new Date(a.exDate))[0]
                                : null;
                            return latest ? (
                                <MetricChip
                                    label="최근회차 배당금"
                                    value={fmtNum(latest.dps, stock.currency)}
                                    icon={<CalendarDays className="w-3.5 h-3.5" />}
                                />
                            ) : null;
                        })()}
                        <MetricChip
                            label="MDD (10년)"
                            value={
                                loadingMdd
                                    ? '···'
                                    : mddData?.mdd10y != null
                                      ? `${mddData.mdd10y.toFixed(1)}%`
                                      : '—'
                            }
                            icon={<TrendingUp className="w-3.5 h-3.5" />}
                            highlight={mddData?.mdd10y != null ? 'red' : undefined}
                        />
                        <MetricChip
                            label="MDD (1년)"
                            value={
                                loadingMdd
                                    ? '···'
                                    : mddData?.mdd1y != null
                                      ? `${mddData.mdd1y.toFixed(1)}%`
                                      : '—'
                            }
                            icon={<TrendingUp className="w-3.5 h-3.5" />}
                            highlight={mddData?.mdd1y != null ? 'amber' : undefined}
                        />
                    </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-3">
                    {stock.description}
                </p>
            </div>
            {/* ── 공유 / 캡처 액션 버튼 ── */}
            <div className="flex gap-2 mt-2 justify-end flex-wrap">
                <button
                    onClick={handleShare}
                    className="dm-primary-control py-1.5"
                >
                    <Share2 className="w-3.5 h-3.5" />
                    공유하기
                </button>
                <a
                    href={threadsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dm-control py-1.5"
                >
                    <svg width="14" height="14" viewBox="0 0 192 192" fill="currentColor" aria-hidden="true">
                        <path d="M141.537 88.988a66 66 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.7-8.664 14.663-10.52 21.348-10.52h.23c8.249.053 14.474 2.452 18.502 7.13 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.245-15.224-1.628-23.693-1.14-23.794 1.372-39.094 15.377-38.108 34.8.498 9.836 5.443 18.296 13.932 23.822 7.16 4.697 16.382 6.993 25.944 6.48 12.638-.695 22.564-5.516 29.502-14.33 5.28-6.687 8.617-15.348 10.098-26.261 6.054 3.655 10.532 8.499 13.01 14.42 4.239 10.148 4.49 26.836-8.964 40.22-11.85 11.79-26.123 16.89-47.644 17.04-23.912-.168-41.974-7.839-53.692-22.8-10.976-14.007-16.642-34.208-16.838-60.043.196-25.835 5.862-46.036 16.838-60.043 11.718-14.961 29.78-22.632 53.692-22.8 24.076.17 42.37 7.881 54.434 22.92 5.981 7.468 10.469 16.98 13.393 28.19l16.212-4.326c-3.554-13.31-9.254-24.787-17.067-34.08C130.577 11.45 107.244 2.07 79.528 1.9h-.558C51.358 2.07 28.27 11.496 14.662 29.988 2.44 46.76-3.835 70.128-4 96.02l.003.562C-3.835 122.47 2.44 145.838 14.662 162.61c13.608 18.489 36.693 27.921 64.308 28.085h.558c24.547-.138 41.85-6.609 56.103-20.826 18.833-18.755 18.29-43.13 12.123-57.876-4.48-10.733-13.11-19.47-25.217-25.005Zm-44.258 43.871c-10.426.58-21.258-4.096-21.808-14.155-.395-7.399 5.274-15.656 22.38-16.619 1.958-.113 3.88-.168 5.768-.168 6.335 0 12.27.606 17.653 1.785-2.009 25.115-13.945 28.612-23.993 29.157Z" />
                    </svg>
                    Threads
                </a>
            </div>
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
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
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
    const years = [getCurrentYear() - 1, getCurrentYear()];
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
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
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
                    <div key={row.year}>
                        <div className="flex items-center gap-2 mb-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold">
                                {row.year}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
                            {row.months.map((monthData, idx) => {
                                const isCurrentMonth = row.year === getCurrentYear() && idx === getCurrentMonth();
                                const hasEvent = monthData.ex.length > 0 || monthData.pay.length > 0;
                                return (
                                    <div
                                        key={row.year + '-' + idx}
                                        className={
                                            'rounded-lg border transition-colors ' +
                                            (isCurrentMonth
                                                ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60')
                                        }
                                    >
                                        <div
                                            className={
                                                'text-center py-1 text-[11px] font-semibold rounded-t-lg ' +
                                                (isCurrentMonth
                                                    ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40'
                                                    : 'text-slate-500 dark:text-slate-400')
                                            }
                                        >
                                            {MONTH_SHORT[idx]}
                                            {isCurrentMonth && (
                                                <span className="ml-0.5 text-[8px] font-bold text-indigo-400 align-super">
                                                    NOW
                                                </span>
                                            )}
                                        </div>

                                        <div className="p-1 flex flex-col gap-0.5 min-h-[60px]">
                                            {!hasEvent && (
                                                <div className="flex items-center justify-center flex-1 h-full">
                                                    <span className="text-[10px] text-slate-300 dark:text-slate-600">
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
                                                            'rounded-md px-1 py-0.5 ' +
                                                            (isPast
                                                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 opacity-55'
                                                                : 'bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700')
                                                        }
                                                    >
                                                        <p className="text-[8px] font-bold text-red-600 dark:text-red-400 leading-tight">
                                                            EX
                                                        </p>
                                                        <p className="text-[10px] font-semibold text-red-700 dark:text-red-300 leading-tight">
                                                            {fmtMD(ev.exDate)}
                                                        </p>
                                                        <p className="text-[9px] text-red-500 dark:text-red-400 leading-tight">
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
                                                            'rounded-md px-1 py-0.5 ' +
                                                            (isPast
                                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40 opacity-55'
                                                                : 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700')
                                                        }
                                                    >
                                                        <p className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 leading-tight">
                                                            PAY
                                                        </p>
                                                        <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 leading-tight">
                                                            {fmtMD(ev.payDate)}
                                                        </p>
                                                        <p className="text-[9px] text-emerald-500 dark:text-emerald-400 leading-tight">
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
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
                <Clock className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {getCurrentYear()}년 배당 상세 일정
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
// 10. (removed: DividendCalculator)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// 11. DpsBarChart
// ─────────────────────────────────────────────
function DpsBarChartTooltip({
    active,
    payload,
    label,
    tooltipBg,
    tooltipBorder,
    tooltipText,
    tooltipSubText,
    currency,
}) {
    if (!active || !payload || !payload.length) return null;
    const title = payload[0]?.payload?.label || label;
    return (
        <div
            className="rounded-lg shadow-lg p-3 text-xs"
            style={{ background: tooltipBg, border: '1px solid ' + tooltipBorder, color: tooltipText }}
        >
            <p className="font-semibold mb-1">{title}</p>
            <p style={{ color: tooltipSubText }}>세후: {fmtNum(payload[0] && payload[0].value, currency)}</p>
        </div>
    );
}

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

    const data = historyEvents.map((ev, i) => {
        const exDate = parseDate(ev.exDate);
        const year = exDate.getFullYear();
        const month = exDate.getMonth() + 1;
        return {
            period: `${String(year).slice(2)}.${String(month).padStart(2, '0')}`,
            label: `${i + 1}회 · ${year}.${String(month).padStart(2, '0')} 배당락`,
            net: parseFloat((ev.dps * (1 - stock.taxRate)).toFixed(4)),
        };
    });
    const xTickInterval = Math.max(0, Math.ceil(data.length / 6) - 1);

    return (
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">회차별 주당 배당금 (세후)</h2>
            </div>
            <ResponsiveContainer width="100%" height={216}>
                <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                        dataKey="period"
                        tick={{ fill: axisColor, fontSize: 10 }}
                        interval={xTickInterval}
                        minTickGap={10}
                        axisLine={false}
                        tickLine={false}
                        height={28}
                    />
                    <YAxis
                        tick={{ fill: axisColor, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => fmtNum(v, stock.currency)}
                        width={65}
                    />
                    <Tooltip
                        content={
                            <DpsBarChartTooltip
                                tooltipBg={tooltipBg}
                                tooltipBorder={tooltipBorder}
                                tooltipText={tooltipText}
                                tooltipSubText={tooltipSubText}
                                currency={stock.currency}
                            />
                        }
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
    // ── 비교형·시뮬레이션 (롱테일 키워드 강화) ──────────────────────────────
    {
        q: 'SCHD vs JEPI 어느 ETF가 더 좋나요?',
        a: 'SCHD와 JEPI는 투자 목적에 따라 다릅니다. SCHD는 배당 성장률이 연 10~12%로 높아 장기 자산 증식에 유리하고, 배당수익률은 약 3.5~4.5%입니다. JEPI는 배당수익률이 약 7~9%로 높아 즉각적인 현금 흐름이 필요한 투자자에게 적합하지만, 주가 상승 시 수익이 커버드콜(ELN)로 제한됩니다. 장기 성장을 원하면 SCHD, 높은 월배당이 필요하면 JEPI, 두 가지를 함께 보유하는 혼합 전략도 인기가 있습니다.',
    },
    {
        q: 'JEPI vs JEPQ 차이가 무엇인가요?',
        a: 'JEPI는 S&P 500 기반, JEPQ는 나스닥100 기반 커버드콜 ETF입니다. JEPI는 배당수익률 약 7~9%, 변동성이 낮고 방어적입니다. JEPQ는 배당수익률 약 9~12%로 더 높고, 기술주 비중이 높아 나스닥 상승 시 수익이 더 크지만 하락 시 변동성도 더 큽니다. 두 ETF 모두 월배당을 지급합니다.',
    },
    {
        q: '월배당 ETF와 분기배당 ETF 중 어느 것이 유리한가요?',
        a: '월배당 ETF(JEPI, JEPQ, QYLD 등)는 매달 현금이 들어와 생활비나 재투자 주기가 짧아 복리 효과를 빨리 누릴 수 있습니다. 분기배당 ETF(SCHD, VYM 등)는 배당 성장률이 높고 장기적으로 배당금이 꾸준히 늘어나 자산 증식에 더 유리합니다. 노후에 현금 흐름이 필요하다면 월배당, 장기 투자라면 분기배당 ETF를 중심으로 구성하는 것이 일반적입니다.',
    },
    {
        q: 'SCHD 1억 원 투자하면 배당금이 얼마인가요?',
        a: 'SCHD 배당수익률이 약 4%라고 가정하면, 1억 원 투자 시 연간 배당금은 세전 약 400만 원(분기당 약 100만 원)입니다. 미국 원천징수세 15%를 제외하면 세후 실수령액은 연간 약 340만 원(월 약 28만 원)입니다. 단, 배당수익률은 주가와 배당금 변동에 따라 달라지므로 배당의 민족에서 SCHD를 검색해 최신 수익률을 확인하세요.',
    },
    {
        q: 'JEPQ 1000만 원 투자 시 월 배당금은 얼마인가요?',
        a: 'JEPQ 배당수익률이 약 10%라고 가정하면, 1,000만 원 투자 시 연간 배당금은 세전 약 100만 원(월 약 8.3만 원)입니다. 미국 원천징수세 15% 차감 후 세후 실수령액은 월 약 7만 원입니다. 배당수익률은 시장 상황에 따라 매달 달라지므로 배당의 민족에서 JEPQ를 검색해 최신 DPS(주당배당금)와 수익률을 확인하세요.',
    },
    {
        q: '배당금으로 월 100만 원 받으려면 얼마가 필요한가요?',
        a: '세후 월 100만 원(연 1,200만 원) 배당금을 받으려면 투자 원금이 얼마 필요한지는 포트폴리오 배당수익률에 따라 다릅니다. ①SCHD(세후 약 3.4%): 약 3억 5,000만 원 필요 ②JEPI(세후 약 6.4%): 약 1억 8,750만 원 필요 ③JEPQ(세후 약 8.5%): 약 1억 4,100만 원 필요. 커버드콜 ETF는 수익률이 높지만 배당 변동성이 크므로, SCHD와 혼합 포트폴리오 구성이 안정적입니다.',
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
            className="dm-shell-container pb-6"
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
                        className="dm-card p-4"
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
                        className="dm-card p-4"
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
        <section aria-label="자주 묻는 질문" className="dm-shell-container pb-6">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">
                자주 묻는 질문 (FAQ)
            </h2>
            <div className="flex flex-col gap-2">
                {FAQ_ITEMS.map((item, idx) => {
                    const isOpen = openIdx === idx;
                    return (
                        <div
                            key={idx}
                            className="dm-card overflow-hidden"
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
// ─────────────────────────────────────────────
// 12-b. LoadingSkeleton – 티커 로딩 중 표시
// ─────────────────────────────────────────────
function LoadingSkeleton({ symbol }) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={`${symbol} 로딩 중`}
            className="flex-1 w-full flex flex-col gap-4 min-w-0 animate-pulse"
        >
            {/* Header skeleton */}
            <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/60 p-4 sm:p-5 shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700" />
                    <div className="flex-1 space-y-2">
                        <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                </div>
                <div className="flex gap-2 mt-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 flex-1 rounded-lg bg-slate-200 dark:bg-slate-700" />
                    ))}
                </div>
            </div>
            {/* Chart skeleton */}
            <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/60 p-4 sm:p-5 shadow-xl">
                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                <div className="h-[180px] rounded-lg bg-slate-200 dark:bg-slate-700" />
            </div>
            {/* Timeline skeleton */}
            <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/60 p-4 sm:p-5 shadow-xl">
                <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-700 mb-3" />
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
                    {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="h-16 rounded-lg bg-slate-200 dark:bg-slate-700" />
                    ))}
                </div>
            </div>
            {/* Loading text */}
            <div className="flex items-center justify-center gap-2 py-4">
                <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-slate-500 dark:text-slate-400">{symbol} 배당 정보를 불러오는 중…</span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 13. EmptyState
// ─────────────────────────────────────────────
function EmptyState({ onPickTicker, exchangeRate, exchangeRateUpdatedAt, exchangeRateSource }) {
    const rateText =
        exchangeRate == null
            ? '환율 로드 중'
            : `환율 기준 ₩${fmtExchangeRate(exchangeRate)}/USD`;
    const rateMeta = exchangeRateUpdatedAt
        ? ` · ${new Date(exchangeRateUpdatedAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
          })}${exchangeRateSource ? ` · ${exchangeRateSource}` : ''}`
        : '';

    return (
        <div className="flex-1">
            <div className="dm-card overflow-hidden">
                <div>
                    <div className="p-5 sm:p-7">
                        <div className="mb-5 flex items-start gap-4">
                            <div className="dm-brand-mark">
                                <Search className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase text-orange-500">Dividend Dashboard</p>
                                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                                    배당 일정과 수익률을 한 화면에서 확인하세요
                                </h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    미국 ETF와 한국 종목을 검색하면 배당락일, 지급일, DPS, 세후 배당금, 구성종목까지 이어서 볼 수 있습니다.
                                </p>
                            </div>
                        </div>

                        <div className="mb-5 grid gap-0 overflow-hidden rounded-lg border border-slate-200/80 dark:border-slate-800 sm:grid-cols-3">
                            {[
                                ['검색', '티커와 종목명'],
                                ['일정', '배당락일과 지급일'],
                                ['분석', '세후 DPS와 MDD'],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="border-b border-slate-200/80 px-4 py-3 last:border-b-0 dark:border-slate-800 sm:border-b-0 sm:border-r sm:last:border-r-0"
                                >
                                    <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                                    <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => document.querySelector('input[type="text"]')?.focus()}
                                className="dm-primary-control text-sm"
                            >
                                <Search className="w-4 h-4" />
                                티커 검색 시작
                            </button>
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {rateText}{rateMeta}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-5">
                            <span className="text-xs text-slate-400 w-full">추천 티커</span>
                            {PRESET_TICKERS.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => onPickTicker && onPickTicker(t)}
                                    className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-orange-500 dark:hover:text-orange-300"
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
    const weightApprox = holdingsData?.weightApprox === true;

    const chartData = holdings.slice(0, 10).map((h) => ({
        name: h.name.length > 12 ? h.name.slice(0, 11) + '…' : h.name,
        weight: h.weight,
    }));

    const axisColor = dark ? '#94a3b8' : '#64748b';
    const tooltipBg = dark ? '#0f172a' : '#ffffff';
    const tooltipBorder = dark ? '#1f2937' : '#e2e8f0';
    const tooltipText = dark ? '#e2e8f0' : '#0f172a';
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
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    구성종목{holdings.length > 0 ? ` (상위 ${holdings.length}개)` : ''}
                </h2>
                {weightApprox && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                        비중 근사값
                    </span>
                )}
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
                                        formatter={(v) => [v.toFixed(2) + '%', weightApprox ? '비중(근사)' : '비중']}
                                        contentStyle={{
                                            background: tooltipBg,
                                            border: '1px solid ' + tooltipBorder,
                                            borderRadius: 8,
                                            fontSize: 12,
                                            color: tooltipText,
                                        }}
                                        labelStyle={{ color: tooltipText }}
                                        itemStyle={{ color: tooltipText }}
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
                                        {['#', '종목명', '티커', weightApprox ? '비중(근사)' : '비중']
                                            .concat(isKR ? ['보유주수'] : [])
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
                                    {holdings.map((h, idx) => (
                                        <tr
                                            key={`${h.ticker || h.name || 'unknown'}-${idx}`}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                        >
                                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500 font-mono">
                                                {h.rank}
                                            </td>
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
                                                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                                                    {h.shares != null ? h.shares.toLocaleString() : '—'}
                                                </td>
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
// 13-B. CapexContainer (설비투자)
// ─────────────────────────────────────────────
function CapexContainer({ stock, capexData, loading }) {
    const { dark } = useTheme();
    if (!stock || stock.quoteType !== 'EQUITY') return null;

    const annual = capexData?.annual || [];
    const error = capexData?.error;
    const source = capexData?.source || '';
    const currency = capexData?.currency || (stock.country === 'KR' ? 'KRW' : 'USD');

    const isKR = currency === 'KRW';
    const formatAmount = (val) => {
        if (val == null) return '-';
        if (isKR) {
            const abs = Math.abs(val);
            if (abs >= 1e12) return (val / 1e12).toFixed(2) + '조';
            if (abs >= 1e8) return Math.round(val / 1e8).toLocaleString() + '억';
            return val.toLocaleString('ko-KR');
        }
        const abs = Math.abs(val);
        if (abs >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
        return '$' + val.toLocaleString('en-US');
    };

    // YoY 변화율 계산
    const chartData = annual.map((d, i) => {
        const prev = i > 0 ? annual[i - 1].amount : null;
        const yoy = prev ? ((d.amount - prev) / prev) * 100 : null;
        return { ...d, yoy };
    });

    const BAR_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#fff7ed'];
    const gridColor = dark ? '#1e293b' : '#f1f5f9';

    return (
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
                <Factory className="w-4 h-4 text-orange-500" />
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">설비투자 (CAPEX)</h2>
                {source && <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">{source}</span>}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-6 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                    ))}
                </div>
            ) : error && annual.length === 0 ? (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    <span>CAPEX 데이터를 불러올 수 없습니다.</span>
                </div>
            ) : annual.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">데이터 없음</p>
            ) : (
                <>
                    {/* Bar Chart */}
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                            <XAxis
                                dataKey="year"
                                tick={{ fontSize: 11, fill: dark ? '#94a3b8' : '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: dark ? '#94a3b8' : '#64748b' }}
                                tickFormatter={(v) => formatAmount(v)}
                                width={60}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: dark ? '#1e293b' : '#ffffff',
                                    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    color: dark ? '#e2e8f0' : '#1e293b',
                                }}
                                labelStyle={{ color: dark ? '#cbd5e1' : '#1e293b' }}
                                itemStyle={{ color: dark ? '#f1f5f9' : '#1e293b' }}
                                formatter={(value, name) => {
                                    if (name === 'amount') return [formatAmount(value), 'CAPEX'];
                                    return [value, name];
                                }}
                                labelFormatter={(label) => `FY ${label}`}
                            />
                            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                {chartData.map((_, i) => (
                                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>

                    {/* Table */}
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="text-left py-1.5 px-2 text-slate-500 dark:text-slate-400 font-medium">
                                        연도
                                    </th>
                                    <th className="text-right py-1.5 px-2 text-slate-500 dark:text-slate-400 font-medium">
                                        CAPEX
                                    </th>
                                    <th className="text-right py-1.5 px-2 text-slate-500 dark:text-slate-400 font-medium">
                                        YoY
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {chartData.map((d) => (
                                    <tr key={d.year} className="border-b border-slate-100 dark:border-slate-700/50">
                                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">FY {d.year}</td>
                                        <td className="py-1.5 px-2 text-right font-mono text-slate-900 dark:text-white">
                                            {formatAmount(d.amount)}
                                        </td>
                                        <td
                                            className={`py-1.5 px-2 text-right font-mono ${
                                                d.yoy == null
                                                    ? 'text-slate-400 dark:text-slate-500'
                                                    : d.yoy > 0
                                                      ? 'text-emerald-600 dark:text-emerald-400'
                                                      : d.yoy < 0
                                                        ? 'text-red-500 dark:text-red-400'
                                                        : 'text-slate-500 dark:text-slate-400'
                                            }`}
                                        >
                                            {d.yoy == null ? '-' : `${d.yoy > 0 ? '+' : ''}${d.yoy.toFixed(1)}%`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function getKrEtfTaxProfile(stock) {
    const region = stock.etfMarket || '';
    const assetType = stock.etfAssetType || '';
    const taxType = stock.etfTaxType || '';
    const hasHoldingPeriodTax = taxType.includes('보유기간과세');
    const hasSeparateTax = taxType.includes('분리과세');
    const hasTaxExempt = taxType.includes('비과세');
    const isOverseas = region.includes('해외');
    const isMixedAsset = assetType.includes('혼합');

    let gain = '상품 구조별 과세 확인 필요';
    if (hasHoldingPeriodTax) {
        gain = '보유기간 과표증분 15.4%';
    } else if (hasSeparateTax) {
        gain = '분리과세 대상 가능';
    } else if (hasTaxExempt) {
        gain = '국내주식형 매매차익 비과세 가능';
    }

    const classification = [region, assetType, taxType].filter(Boolean).join(' · ') || 'ETF 세부 분류 미확인';
    const checkpoint = taxType
        ? `${classification}${isMixedAsset ? ' · 혼합자산 편입비중 확인' : ''}`
        : `${classification} · 운용사 투자설명서 확인`;

    return {
        region,
        assetType,
        taxType,
        classification,
        dividend: isOverseas ? '분배금 15.4% 원천징수, 해외원천세 영향 가능' : '분배금 15.4% 원천징수',
        gain,
        isaDividend: 'ISA 순이익에 포함',
        isaGain: hasHoldingPeriodTax ? '보유기간과세 손익도 ISA 손익통산' : 'ETF 매매손익 ISA 손익통산',
        pensionNote: `${region || '국내상장'} ETF · 연금계좌 편입 가능 여부 확인`,
        checkpoint,
    };
}

function getTaxComparisonRows(stock) {
    const isUS = stock.country === 'US';
    const isETF = stock.quoteType === 'ETF' || stock.quoteType === 'MUTUALFUND';
    const krEtfTax = !isUS && isETF ? getKrEtfTaxProfile(stock) : null;

    return [
        {
            account: '일반주식계좌',
            dividend: krEtfTax ? krEtfTax.dividend : isUS ? '미국 원천 15% 중심' : '15.4% 원천징수',
            gain: isUS
                ? '연 250만원 공제 후 22%'
                : krEtfTax
                  ? krEtfTax.gain
                : isETF
                  ? '상품 구조별 15.4% 가능'
                  : '상장 소액주주 통상 비과세',
            note: krEtfTax ? krEtfTax.checkpoint : '금융소득 2천만원 초과 시 종합과세 가능',
        },
        {
            account: 'ISA계좌',
            dividend: krEtfTax ? krEtfTax.isaDividend : '순이익 200만원 비과세, 초과 9.9%',
            gain: krEtfTax ? krEtfTax.isaGain : '손익통산 후 200만원 비과세, 초과 9.9%',
            note: krEtfTax
                ? '만기 순이익 일반형 200만원 비과세, 초과 9.9%'
                : isUS
                ? '해외상장 직접투자는 제한, 국내상장 대체 ETF 기준'
                : '서민형은 비과세 한도 400만원',
        },
        {
            account: '연금저축계좌',
            dividend: '계좌 내 과세이연, 연금수령 3.3~5.5%',
            gain: '계좌 내 과세이연, 연금수령 3.3~5.5%',
            note: krEtfTax
                ? krEtfTax.pensionNote
                : isETF
                ? '국내상장 ETF/펀드 중심, 연금외수령 16.5% 가능'
                : '개별주식 직접투자는 제한, 펀드/ETF 운용 중심',
        },
    ];
}

function getTaxAccountTone(index) {
    const tones = [
        {
            accent: 'border-orange-200 bg-orange-50/70 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300',
            dot: 'bg-orange-500',
            line: 'from-orange-500/70 to-orange-200 dark:to-orange-900',
        },
        {
            accent: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
            dot: 'bg-emerald-500',
            line: 'from-emerald-500/70 to-emerald-200 dark:to-emerald-900',
        },
        {
            accent: 'border-sky-200 bg-sky-50/70 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300',
            dot: 'bg-sky-500',
            line: 'from-sky-500/70 to-sky-200 dark:to-sky-900',
        },
    ];
    return tones[index % tones.length];
}

function TaxFlowCard({ row, index }) {
    const tone = getTaxAccountTone(index);
    const steps = [
        { label: '배당·분배금', value: row.dividend, icon: <DollarSign className="h-3.5 w-3.5" /> },
        { label: '차익', value: row.gain, icon: <TrendingUp className="h-3.5 w-3.5" /> },
    ];

    return (
        <div className="rounded-lg border border-slate-200/80 bg-white/75 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/55">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                    <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{row.account}</h3>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.accent}`}>
                    계좌 {index + 1}
                </span>
            </div>

            <div className="relative grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/35">
                    <p className="text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500">과세 방식</p>
                    <div className="mt-2 grid gap-2">
                        {steps.map((step) => (
                            <div key={step.label} className="rounded-md bg-white px-2.5 py-2 shadow-sm dark:bg-slate-900">
                                <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                    {step.icon}
                                    {step.label}
                                </p>
                                <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">
                                    {step.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="hidden items-center md:flex" aria-hidden>
                    <div className={`h-px w-8 bg-gradient-to-r ${tone.line}`} />
                </div>

                <div className={`rounded-lg border p-3 ${tone.accent}`}>
                    <p className="text-[10px] font-semibold uppercase opacity-75">확인 포인트</p>
                    <p className="mt-2 text-xs font-semibold leading-5">{row.note}</p>
                </div>
            </div>
        </div>
    );
}

function TaxComparisonPanel({ stock }) {
    const rows = getTaxComparisonRows(stock);
    const isUS = stock.country === 'US';
    const isETF = stock.quoteType === 'ETF' || stock.quoteType === 'MUTUALFUND';
    const krEtfTax = !isUS && isETF ? getKrEtfTaxProfile(stock) : null;
    const assetType = krEtfTax
        ? `한국 ETF · ${krEtfTax.classification}`
        : `${isUS ? '미국' : '한국'} ${isETF ? 'ETF/펀드' : '주식'}`;

    return (
        <div className="dm-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800 sm:px-5">
                <div className="flex min-w-0 items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            계좌유형별 과세율 비교
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            조회 종목 기준: {assetType} · 일반 요약
                        </p>
                    </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {getToday().toISOString().slice(0, 10)} 기준
                </span>
            </div>

            <div className="space-y-3 px-4 py-4 sm:px-5">
                {krEtfTax && (
                    <div className="flex flex-wrap gap-2">
                        {[
                            ['투자지역', krEtfTax.region || '미확인'],
                            ['자산분류', krEtfTax.assetType || '미확인'],
                            ['과세유형', krEtfTax.taxType || '미확인'],
                        ].map(([label, value]) => (
                            <span
                                key={label}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <span className="text-slate-400 dark:text-slate-500">{label}</span>
                                {value}
                            </span>
                        ))}
                    </div>
                )}

                <div className="space-y-3">
                    {rows.map((row, index) => (
                        <TaxFlowCard key={row.account} row={row} index={index} />
                    ))}
                </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[11px] leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 sm:px-5">
                실제 세금은 거주자 여부, 금융소득 합계, 손익통산, 상품 편입자산, 중도해지 여부에 따라 달라질 수 있습니다.
                투자 판단 전 증권사 과세 안내와 세무 전문가 확인이 필요합니다.
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 13. StockDetailView
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 13-a. StockJsonLd — 종목별 구조화 데이터
// ─────────────────────────────────────────────
function StockJsonLd({ stock }) {
    if (!stock?.ticker) return null;
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'FinancialProduct',
        name: `${stock.name || stock.ticker} 배당 정보`,
        description: `${stock.name || stock.ticker}(${stock.ticker})의 배당락일, 주당배당금(DPS), 배당수익률, 지급일 실시간 정보`,
        url: `https://divi-tracker.netlify.app/?ticker=${stock.ticker}`,
        provider: {
            '@type': 'Organization',
            name: '배당의 민족',
            url: 'https://divi-tracker.netlify.app/',
        },
        ...(stock.dividendYield > 0 && { annualPercentageRate: stock.dividendYield }),
    };
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />;
}

// ─────────────────────────────────────────────
// 13-b. StockDetailView
// ─────────────────────────────────────────────
function StockDetailView({ stock, holdingsData, loadingHoldings, capexData, loadingCapex, mddData, loadingMdd }) {
    return (
        <div className="flex-1 w-full flex flex-col gap-4 min-w-0">
            <StockJsonLd stock={stock} />
            <StockInfoHeader stock={stock} mddData={mddData} loadingMdd={loadingMdd} />
            <TaxComparisonPanel stock={stock} />
            <DpsBarChart stock={stock} />
            <DividendTimeline stock={stock} />
            <CapexContainer stock={stock} capexData={capexData} loading={loadingCapex} />
            <EtpHoldingsContainer stock={stock} holdingsData={holdingsData} loading={loadingHoldings} />
        </div>
    );
}

// ─────────────────────────────────────────────
// 14. EtfExplorerPage
// ─────────────────────────────────────────────
const ETF_FUNDS = [
    { id: 'ARKK', label: 'ARKK', desc: 'ARK Innovation ETF', color: 'text-indigo-500' },
    { id: 'BRK-B', label: 'BRK-B', desc: '버크셔 해서웨이', color: 'text-amber-500' },
];

function EtfExplorerPage({ onBack, krEtfs, krDataReady }) {
    const { dark } = useTheme();
    const [view, setView] = useState('portfolio'); // 'portfolio' | 'etf-search'
    const [activeFund, setActiveFund] = useState('ARKK');
    const [data, setData] = useState({}); // { ARKK: {...}, 'BRK-B': {...} }
    const [loading, setLoading] = useState({});
    const [errors, setErrors] = useState({});
    const [mddData, setMddData] = useState({}); // { ARKK: {TSLA: -82.4, ...}, 'BRK-B': {...} }
    const [loadingMdd, setLoadingMdd] = useState({}); // { ARKK: true/false }

    const fetchMdd = useCallback(async (fund, holdings) => {
        const tickers = holdings
            .map((h) => h.ticker)
            .filter(Boolean)
            .slice(0, 15)
            .join(',');
        if (!tickers) return;
        setLoadingMdd((p) => ({ ...p, [fund]: true }));
        try {
            const res = await fetch(`/api/mdd?tickers=${encodeURIComponent(tickers)}&years=10`);
            if (!res.ok) return;
            const json = await res.json();
            if (!json.error) setMddData((p) => ({ ...p, [fund]: json }));
        } catch (_) {
        } finally {
            setLoadingMdd((p) => ({ ...p, [fund]: false }));
        }
    }, []);

    const fetchFund = useCallback(
        async (fund) => {
            if (loading[fund]) return;
            setLoading((p) => ({ ...p, [fund]: true }));
            try {
                const res = await fetch(`/api/etf-explorer?fund=${encodeURIComponent(fund)}`);
                if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
                const json = await res.json();
                if (json.error && !json.holdings?.length) throw new Error(json.error);
                setData((p) => ({ ...p, [fund]: json }));
                if (json.holdings?.length) fetchMdd(fund, json.holdings);
            } catch (e) {
                setErrors((p) => ({ ...p, [fund]: e.message }));
            } finally {
                setLoading((p) => ({ ...p, [fund]: false }));
            }
        },
        [loading, fetchMdd],
    );

    useEffect(() => {
        fetchFund(activeFund);
    }, [activeFund]);

    const current = data[activeFund];
    const isLoading = loading[activeFund];
    const currentMdd = mddData[activeFund] || {};
    const isMddLoading = loadingMdd[activeFund] ?? false;
    const error = errors[activeFund];

    const fmtPrice = (v) => {
        if (v == null) return '—';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(
            v,
        );
    };
    const fmtMdd = (v) => {
        if (v == null) return '—';
        const cls =
            v <= -50
                ? 'text-red-600 dark:text-red-400'
                : v <= -30
                  ? 'text-orange-500 dark:text-orange-400'
                  : 'text-yellow-600 dark:text-yellow-400';
        return <span className={cls}>{v.toFixed(1)}%</span>;
    };

    return (
        <main className="dm-shell-container flex-1 py-4 sm:py-6">
            {/* 상단 헤더 */}
            <div className="flex items-center gap-3 mb-5">
                <button
                    onClick={onBack}
                    className="dm-control py-1.5"
                >
                    ← 뒤로
                </button>
                <div>
                    <h1 className="text-base font-bold text-slate-900 dark:text-white">포트폴리오 엿보기</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        구성종목 · 비중 · 가격 · 현재 낙폭 · 매매내역
                    </p>
                </div>
            </div>

            {/* 뷰 토글 */}
            <div className="flex gap-2 mb-5">
                {[
                    { id: 'portfolio', label: '포트폴리오 엿보기', desc: 'ARKK · BRK-B' },
                    { id: 'etf-search', label: 'ETF 구성종목 검색', desc: '원그래프' },
                ].map((v) => (
                    <button
                        key={v.id}
                        onClick={() => setView(v.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all
                            ${view === v.id
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                : 'bg-white/70 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700'
                            }`}
                    >
                        {v.label}
                        <span className={`ml-1.5 text-xs font-normal ${view === v.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {v.desc}
                        </span>
                    </button>
                ))}
            </div>

            {view === 'etf-search' ? (
                <EtfSearchView krEtfs={krEtfs} krDataReady={krDataReady} />
            ) : (
                <>
                    {/* 펀드 탭 */}
                    <div className="flex gap-2 mb-5">
                        {ETF_FUNDS.map((f) => (
                            <button
                                key={f.id}
                                onClick={() => {
                                    if (f.id === activeFund) return;
                                    setData((prev) => {
                                        const n = { ...prev };
                                        delete n[f.id];
                                        return n;
                                    });
                                    setErrors((prev) => {
                                        const n = { ...prev };
                                        delete n[f.id];
                                        return n;
                                    });
                                    setActiveFund(f.id);
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all
                                    ${
                                        activeFund === f.id
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                            : 'bg-white/70 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <span className={activeFund === f.id ? 'text-white' : f.color}>{f.label}</span>
                                <span
                                    className={`ml-1.5 text-xs font-normal ${activeFund === f.id ? 'text-indigo-200' : 'text-slate-400'}`}
                                >
                                    {f.desc}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* 로딩 */}
                    {isLoading && (
                        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-6 shadow-xl">
                            <div className="space-y-3 animate-pulse">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="flex gap-3 items-center">
                                        <div className="w-6 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                        <div className="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                        <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                        <div className="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                        <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                        <div className="w-16 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                                    </div>
                                ))}
                            </div>
                            <p className="text-center text-xs text-slate-400 mt-4">
                                데이터 로딩 중… (가격 조회 포함, 10초 내외 소요)
                            </p>
                        </div>
                    )}

                    {/* 에러 */}
                    {!isLoading && error && (
                        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 border border-red-200 dark:border-red-800/40 p-6 shadow-xl flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-red-600 dark:text-red-400">데이터 로딩 실패</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{error}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setErrors((p) => ({ ...p, [activeFund]: undefined }));
                                    fetchFund(activeFund);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}

                    {/* 구성종목 테이블 */}
                    {!isLoading && current && (
                        <>
                            <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 shadow-xl mb-4 overflow-hidden">
                                <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <BarChart2 className="w-4 h-4 text-indigo-500" />
                                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            구성종목 ({current.holdings?.length ?? 0}개)
                                        </h2>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-slate-400 dark:text-slate-500">
                                            출처: {current.source}
                                        </span>
                                        {current.updatedAt && (
                                            <span className="ml-2 text-xs text-slate-300 dark:text-slate-600">
                                                {new Date(current.updatedAt).toLocaleTimeString('ko-KR', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}{' '}
                                                기준
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-sm">
                                        <thead className="sticky top-0 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur">
                                            <tr>
                                                {['#', '종목명', '티커', '비중', '가격(USD)', 'MDD(10년)', '현재 낙폭'].map(
                                                    (h) => (
                                                        <th
                                                            key={h}
                                                            className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
                                                        >
                                                            {h}
                                                        </th>
                                                    ),
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {(current.holdings || []).map((h, idx) => (
                                                <tr
                                                    key={`${h.ticker || h.name || 'unknown'}-${idx}`}
                                                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                                                >
                                                    <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-400 tabular-nums w-8">
                                                        {h.rank}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 max-w-[180px]">
                                                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                                                            {h.name}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5">
                                                        <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                                                            {h.ticker}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {h.weight > 0 ? h.weight.toFixed(2) + '%' : '—'}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                                                        {fmtPrice(h.price)}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 text-xs tabular-nums font-semibold">
                                                        {isMddLoading
                                                            ? <span className="text-slate-400 animate-pulse">···</span>
                                                            : fmtMdd(currentMdd[h.ticker] ?? null)}
                                                    </td>
                                                    <td className="px-3 sm:px-4 py-2.5 text-xs tabular-nums font-semibold">
                                                        {fmtMdd(h.drawdown)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="px-4 py-2 text-[10px] text-slate-400 dark:text-slate-600 border-t border-slate-100 dark:border-slate-800">
                                    * MDD(10년): 최근 10년 월봉 기준 최대낙폭. 현재 낙폭: 52주 고점 대비. 투자 참고용이며 투자 권유가 아닙니다.
                                </p>
                            </div>

                            {/* 최근 매매 내역 */}
                            <EtfTradesSection trades={current.trades} fund={activeFund} note={current.note} />
                        </>
                    )}
                </>
            )}
        </main>
    );
}

function EtfTradesSection({ trades, fund, note }) {
    if (note && !trades?.length) {
        return (
            <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 p-5 shadow-xl">
                <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">최근 매매 내역</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
            </div>
        );
    }

    if (!trades?.length) return null;

    return (
        <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/70 shadow-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    최근 매매 내역 <span className="text-xs font-normal text-slate-400">(최근 1개월)</span>
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                    <thead className="bg-slate-50/90 dark:bg-slate-800/90">
                        <tr>
                            {['날짜', '방향', '티커', '종목명', '수량', 'ETF 비중'].map((h) => (
                                <th
                                    key={h}
                                    className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {trades.map((t, i) => (
                            <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                    {t.date ? t.date.slice(0, 10) : '—'}
                                </td>
                                <td className="px-3 sm:px-4 py-2.5">
                                    <span
                                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full
                                        ${
                                            t.direction === 'BUY'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        }`}
                                    >
                                        {t.direction === 'BUY' ? '▲ 매수' : '▼ 매도'}
                                    </span>
                                </td>
                                <td className="px-3 sm:px-4 py-2.5">
                                    <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                                        {t.ticker}
                                    </span>
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 max-w-[160px]">
                                    <span className="line-clamp-1">{t.name}</span>
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                                    {t.shares > 0 ? t.shares.toLocaleString() : '—'}
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                                    {t.etfPercent != null ? t.etfPercent.toFixed(4) + '%' : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// 14-B. ETF 검색 뷰 (구성종목 원그래프)
// ─────────────────────────────────────────────
const ETF_PIE_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899',
    '#f97316', '#8b5cf6', '#14b8a6', '#ef4444', '#94a3b8',
];

function EtfSearchView({ krEtfs, krDataReady }) {
    const [query, setQuery] = useState('');
    const [debounced, setDebounced] = useState('');
    const [open, setOpen] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggest, setLoadingSuggest] = useState(false);
    const wrapRef = useRef(null);

    const [selectedEtf, setSelectedEtf] = useState(null);
    const [holdingsData, setHoldingsData] = useState(null);
    const [loadingHoldings, setLoadingHoldings] = useState(false);
    const [holdingsError, setHoldingsError] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (debounced.length < 2 || /[가-힣]/.test(debounced)) { setSuggestions([]); return; }
        const ctrl = new AbortController();
        setLoadingSuggest(true);
        fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((d) => {
                setSuggestions(
                    (d.quotes || [])
                        .filter((q) => q.quoteType === 'ETF')
                        .map((q) => ({
                            symbol: q.symbol,
                            name: q.shortname || q.longname || q.symbol,
                            country: 'US',
                        }))
                );
            })
            .catch(() => {})
            .finally(() => setLoadingSuggest(false));
        return () => ctrl.abort();
    }, [debounced]);

    const qLower = query.trim().toLowerCase();
    const isKorean = /[가-힣]/.test(qLower);
    const localKrResults = qLower.length >= (isKorean ? 1 : 2)
        ? (krEtfs || [])
            .filter((e) =>
                isKorean
                    ? (e.name || '').toLowerCase().includes(qLower) || (e.shortName || '').toLowerCase().includes(qLower)
                    : (e.shortName || '').toLowerCase().includes(qLower) || (e.engName || '').toLowerCase().includes(qLower) || e.code.startsWith(qLower)
            )
            .slice(0, 8)
            .map((e) => ({ symbol: e.code, name: e.shortName || e.name, country: 'KR' }))
        : [];

    const seen = new Set();
    const merged = [...localKrResults, ...suggestions].filter((item) => {
        if (seen.has(item.symbol)) return false;
        seen.add(item.symbol);
        return true;
    });

    const handleSelect = useCallback(async (etf) => {
        setQuery(''); setOpen(false);
        setSelectedEtf(etf); setHoldingsData(null); setHoldingsError(null);
        setLoadingHoldings(true);
        try {
            const res = await fetch(`/api/holdings?symbol=${encodeURIComponent(etf.symbol)}&country=${etf.country}`);
            if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
            const json = await res.json();
            if (json.error && !json.holdings?.length) throw new Error(json.error);
            setHoldingsData(json);
        } catch (e) {
            setHoldingsError(e.message);
        } finally {
            setLoadingHoldings(false);
        }
    }, []);

    const pieData = useMemo(() => {
        const holdings = holdingsData?.holdings || [];
        if (!holdings.length) return [];
        const top = holdings.slice(0, 9);
        const othersW = holdings.slice(9).reduce((s, h) => s + (h.weight || 0), 0);
        return [
            ...top.map((h) => ({ name: h.name || h.ticker, ticker: h.ticker, value: h.weight || 0 })),
            ...(othersW > 0.01 ? [{ name: '기타 (Others)', ticker: '', value: +othersW.toFixed(2) }] : []),
        ];
    }, [holdingsData]);

    return (
        <div>
            <div ref={wrapRef} className="relative mb-5">
                <div className="dm-search-shell">
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <input
                        type="text"
                        value={query}
                        placeholder="ETF 티커 또는 이름 검색 (예: QQQ, KODEX200, TIGER)"
                        className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200
                            placeholder:text-slate-400 outline-none"
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                    />
                    {query && (
                        <button onClick={() => { setQuery(''); setOpen(false); }}
                            className="text-slate-400 hover:text-orange-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                {open && (merged.length > 0 || loadingSuggest) && (
                    <ul className="absolute top-full mt-2 left-0 right-0 z-50 rounded-lg shadow-2xl
                        bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl
                        border border-slate-200/80 dark:border-slate-800/70 overflow-hidden"
                        role="listbox">
                        {loadingSuggest && !merged.length && (
                            <li className="px-4 py-3 text-sm text-slate-400">검색 중…</li>
                        )}
                        {merged.map((item) => (
                            <li key={item.symbol} role="option">
                                <button
                                    onClick={() => handleSelect(item)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left
                                        hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors
                                        border-b border-slate-100 dark:border-slate-800 last:border-0"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-950 dark:bg-white
                                        flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                                        <span className="text-white dark:text-slate-950">{item.symbol.slice(0, 2)}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {item.symbol} · {item.country === 'KR' ? '한국 ETF' : 'US ETF'}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {selectedEtf && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedEtf.name}</span>
                    <span className="text-xs font-mono bg-indigo-50 dark:bg-indigo-900/30
                        text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                        {selectedEtf.symbol}
                    </span>
                    <span className="text-xs text-slate-400">{selectedEtf.country}</span>
                    {holdingsData?.source && (
                        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full
                            bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            출처: {holdingsData.source}
                        </span>
                    )}
                </div>
            )}

            {loadingHoldings && (
                <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 border
                    border-slate-200/80 dark:border-slate-800/70 p-6 shadow-xl">
                    <div className="flex flex-col sm:flex-row gap-6 animate-pulse">
                        <div className="w-52 h-52 rounded-full bg-slate-200 dark:bg-slate-700 mx-auto sm:mx-0 flex-shrink-0" />
                        <div className="flex-1 space-y-3 self-center">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded"
                                    style={{ width: `${75 - i * 8}%` }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {!loadingHoldings && holdingsError && (
                <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 border border-red-200
                    dark:border-red-800/40 p-5 shadow-xl flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">구성종목 조회 실패</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{holdingsError}</p>
                    </div>
                    <button
                        onClick={() => selectedEtf && handleSelect(selectedEtf)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20
                            border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400
                            hover:bg-red-100 transition-colors">
                        다시 시도
                    </button>
                </div>
            )}

            {!loadingHoldings && holdingsData?.holdings?.length > 0 && (
                <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl
                    border border-slate-200/80 dark:border-slate-800/70 shadow-xl overflow-hidden">
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-8 items-center sm:items-start">
                        <div className="w-full sm:w-56 flex-shrink-0">
                            <ResponsiveContainer width="100%" height={224}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%" cy="50%"
                                        innerRadius={52} outerRadius={106}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {pieData.map((_, idx) => (
                                            <Cell key={idx} fill={ETF_PIE_COLORS[idx % ETF_PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const { name, ticker, value } = payload[0].payload;
                                            return (
                                                <div className="rounded-lg border px-3 py-2 text-xs shadow-xl
                                                    bg-white dark:bg-slate-900
                                                    border-slate-200 dark:border-slate-700
                                                    text-slate-800 dark:text-slate-200">
                                                    <p className="font-semibold">{name}</p>
                                                    {ticker && <p className="text-slate-400">{ticker}</p>}
                                                    <p className="font-bold mt-1">{value.toFixed(2)}%</p>
                                                </div>
                                            );
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-1 gap-1.5 self-center w-full">
                            {pieData.map((entry, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                        style={{ background: ETF_PIE_COLORS[idx % ETF_PIE_COLORS.length] }} />
                                    <span className="text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">
                                        {entry.name}
                                    </span>
                                    <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-400 flex-shrink-0">
                                        {entry.value.toFixed(2)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800">
                        <div className="px-4 sm:px-5 py-3 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                전체 구성종목 ({holdingsData.holdings.length}개)
                            </h3>
                            {holdingsData.weightApprox && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full
                                    bg-amber-100 dark:bg-amber-900/40
                                    text-amber-600 dark:text-amber-400 font-semibold">
                                    비중 근사값
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto max-h-72 overflow-y-auto">
                            <table className="w-full min-w-[320px] text-xs">
                                <thead className="sticky top-0 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur">
                                    <tr>
                                        {['#', '종목명', '티커', '비중(%)'].map((h) => (
                                            <th key={h} className="px-3 sm:px-4 py-2.5 text-left font-semibold
                                                text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {holdingsData.holdings.map((h, idx) => (
                                        <tr key={h.rank || h.ticker || h.name || `row-${idx}`}
                                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-3 sm:px-4 py-2.5 text-slate-400 tabular-nums w-8">{h.rank}</td>
                                            <td className="px-3 sm:px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200
                                                max-w-[160px] truncate">{h.name}</td>
                                            <td className="px-3 sm:px-4 py-2.5">
                                                <span className="font-mono text-indigo-600 dark:text-indigo-400
                                                    bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded text-[10px]">
                                                    {h.ticker || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 sm:px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                                                {h.weight > 0 ? h.weight.toFixed(2) + '%' : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!selectedEtf && !loadingHoldings && (
                <div className="rounded-lg bg-white/60 dark:bg-slate-900/60 border
                    border-slate-200/80 dark:border-slate-800/70 p-12 shadow-xl
                    flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
                    <Search className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">ETF 티커 또는 이름으로 검색하세요</p>
                    <p className="text-xs opacity-70">예: QQQ · KODEX200 · TIGER · SPY · SCHD</p>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// 15. App Root
// ─────────────────────────────────────────────
function DashboardApp() {
    const { dark, toggle } = useTheme();
    const addToast = useToast();
    const [currentPage, setCurrentPage] = useState('main'); // 'main' | 'etf-explorer'

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
    const deepLinkLoadedRef = useRef(false);
    const fetchAbortRef = useRef(null);

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
    const [exchangeRateSource, setExchangeRateSource] = useState(null);
    const [etpHoldings, setEtpHoldings] = useState({});
    const [loadingHoldings, setLoadingHoldings] = useState(null);
    const etpHoldingsFetchedRef = useRef(new Set());
    const [capexData, setCapexData] = useState({});
    const [loadingCapex, setLoadingCapex] = useState(null);
    const capexFetchedRef = useRef(new Set());

    const [mddData, setMddData] = useState({}); // { [ticker]: { mdd10y, mdd1y } }
    const [loadingMdd, setLoadingMdd] = useState(null); // ticker | null
    const mddFetchedRef = useRef(new Set());

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

    const fetchKsdDividends = async (symbol, signal) => {
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

                const res = await fetch(`/api/ksd-dividends?${params.toString()}`, { signal });
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
        async (symbolInput, signal) => {
            const raw = symbolInput.trim();
            const normalized = normalizeSymbol(raw);
            if (!normalized) throw new Error('티커를 입력하세요');

            let resolvedSymbol = normalized;
            let krShortName = null;
            let krLongName = null;
            let krCsvMatch = null;
            let krEtfMeta = null;

            const applyKrCsvMatch = (match) => {
                if (!match) return;
                krCsvMatch = match;
                krShortName = krShortName || match.shortName || match.name || null;
                krLongName = krLongName || match.name || null;
                if (match.type === 'ETF') {
                    krEtfMeta = {
                        etfMarket: match.market || '',
                        etfAssetType: match.assetType || '',
                        etfTaxType: match.taxType || '',
                        etfListingType: match.listingType || '',
                        etfReplicationType: match.replicationType || '',
                        etfManager: match.manager || '',
                        etfTotalExpense: match.totalExpense || '',
                    };
                }
            };

            // ── CSV 로컬 선행 조회: 6자리 코드 기반 한글명 확보 ──
            const csvSixDigit = extractSixDigit(raw) || extractSixDigit(normalized);
            if (csvSixDigit) {
                const csvMatch = [...krStocks, ...krEtfs].find((s) => s.code === csvSixDigit);
                applyKrCsvMatch(csvMatch);
            }
            if (/[가-힣]/.test(raw) || /\s/.test(raw)) {
                try {
                    const searchRes = await fetch(`/api/search?q=${encodeURIComponent(raw)}&lang=ko-KR&region=KR`, { signal });
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
                const quoteRes = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`, { signal });
                if (!quoteRes.ok) continue;
                quote = await quoteRes.json();
                resolvedSymbol = sym;
                break;
            }
            if (!quote) throw new Error('실시간 시세 조회 실패');

            const resolvedSixDigit = extractSixDigit(resolvedSymbol);
            if (resolvedSixDigit) {
                applyKrCsvMatch([...krStocks, ...krEtfs].find((s) => s.code === resolvedSixDigit));
            }

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

            // KR: ③ 한글명 fallback fetch + ④ KSD 배당을 병렬로 동시 실행
            let events = [];
            if (country === 'KR') {
                const needKrName = !krShortName && !krLongName;
                const sixDigit = resolvedSymbol.replace(/\.(KS|KQ)$/i, '');

                const [krNameResult, ksdResult] = await Promise.allSettled([
                    // ③ 한글명 (필요한 경우에만)
                    needKrName
                        ? fetch(`/api/search?q=${encodeURIComponent(sixDigit)}&lang=ko-KR&region=KR`, { signal })
                              .then((r) => (r.ok ? r.json() : null))
                              .catch(() => null)
                        : Promise.resolve(null),
                    // ④ KSD 배당
                    fetchKsdDividends(resolvedSymbol, signal).catch((err) => {
                        console.warn('KSD dividend fetch failed', err);
                        return [];
                    }),
                ]);

                // ③ 한글명 결과 처리
                if (needKrName && krNameResult.status === 'fulfilled' && krNameResult.value) {
                    const krMatch = (krNameResult.value.quotes || []).find(
                        (q) =>
                            normalizeSymbol(q.symbol) === resolvedSymbol ||
                            q.symbol?.replace(/^KRX:/i, '') + '.KS' === resolvedSymbol,
                    );
                    if (krMatch) {
                        krShortName = krMatch.shortname || null;
                        krLongName = krMatch.longname || null;
                    }
                }

                // ④ KSD 배당 결과 처리
                if (ksdResult.status === 'fulfilled') events = ksdResult.value || [];
            }

            const aliases = [
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
            const quoteType = krEtfMeta ? 'ETF' : quote.quoteType || '';
            const sector = krEtfMeta?.etfAssetType || quote.market || quoteType || 'N/A';

            if (events.length === 0) {
                try {
                    const divRes = await fetch(
                        `/api/dividends?symbol=${encodeURIComponent(resolvedSymbol)}&from=1990-01-01`,
                        { signal },
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
                ...(krCsvMatch
                    ? {
                          krListingName: krCsvMatch.name || '',
                          krShortName: krCsvMatch.shortName || '',
                      }
                    : {}),
                ...(krEtfMeta || {}),
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

    const fetchExchangeRate = useCallback(async (signal) => {
        try {
            const res = await fetch('/api/exchange-rate', {
                signal,
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error('fx fetch failed');
            const data = await res.json();
            const next = Number(data?.rate);
            if (!Number.isFinite(next) || next <= 0) throw new Error('invalid fx rate');
            setExchangeRate(next);
            setExchangeRateUpdatedAt(data.fetchedAt || new Date().toISOString());
            setExchangeRateSource(data.source || 'live');
            return next;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('exchange rate fetch failed', err);
            return null;
        }
    }, []);

    const handleFetchLive = useCallback(
        async (symbolInput) => {
            const symbol = symbolInput.trim();
            if (!symbol) return;
            // 이전 진행 중인 fetch 취소 (race condition 방지)
            if (fetchAbortRef.current) fetchAbortRef.current.abort();
            const controller = new AbortController();
            fetchAbortRef.current = controller;
            setLoadingSymbol(symbol);
            try {
                // fetchLiveStock과 fetchExchangeRate를 병렬 실행
                const [stock] = await Promise.all([fetchLiveStock(symbol, controller.signal), fetchExchangeRate()]);
                if (controller.signal.aborted) return;
                if (!stock) return;
                setLiveCache((prev) => ({ ...prev, [stock.ticker]: stock }));
                setWatchlist((prev) => {
                    const exists = prev.find((s) => s.ticker === stock.ticker);
                    if (exists) return prev.map((s) => (s.ticker === stock.ticker ? stock : s));
                    return [...prev, stock];
                });
                setSelected(stock);
            } catch (err) {
                if (controller.signal.aborted) return;
                console.error(err);
                addToast('실시간 조회 실패: ' + err.message);
            } finally {
                if (!controller.signal.aborted) setLoadingSymbol(null);
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

    // ── URL 딥링크 자동 로드 (최초 마운트 1회) ────────────────────────
    useEffect(() => {
        if (deepLinkLoadedRef.current) return;
        deepLinkLoadedRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const ticker = params.get('ticker')?.toUpperCase();
        const page = params.get('page');
        if (page === 'portfolio') {
            setCurrentPage('etf-explorer');
        } else if (ticker) {
            const cached = liveCache[ticker];
            if (cached) {
                setSelected(cached);
            } else {
                handleFetchLive(ticker);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleFetchLive]);

    const watchlistDebounceRef = useRef(null);
    useEffect(() => {
        clearTimeout(watchlistDebounceRef.current);
        watchlistDebounceRef.current = setTimeout(() => {
            localStorage.setItem('dm-watchlist', JSON.stringify(watchlist.map((s) => s.ticker)));
        }, 100);
    }, [watchlist]);

    const liveCacheDebounceRef = useRef(null);
    useEffect(() => {
        clearTimeout(liveCacheDebounceRef.current);
        liveCacheDebounceRef.current = setTimeout(() => {
            localStorage.setItem('dm-live-cache', JSON.stringify(liveCache));
        }, 100);
    }, [liveCache]);

    const fetchHoldings = useCallback(async (stock) => {
        if (!stock || stock.quoteType !== 'ETF') return;
        const ticker = stock.ticker;
        if (etpHoldingsFetchedRef.current.has(ticker)) return;
        etpHoldingsFetchedRef.current.add(ticker);
        setLoadingHoldings(ticker);
        try {
            const isKR = stock.country === 'KR' || ticker.includes('.KS') || ticker.includes('.KQ');
            const country = isKR ? 'KR' : 'US';
            const m = ticker.match(/(\d{6})/);
            const symbol = isKR && m ? m[1] : ticker;
            const res = await fetch(`/api/holdings?symbol=${encodeURIComponent(symbol)}&country=${country}`);
            if (!res.ok) throw new Error(`holdings API error: HTTP ${res.status}`);
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                // 함수가 미배포 상태이거나 초기화 실패 시 Netlify가 HTML을 대신 반환
                console.warn(`[holdings:${ticker}] Non-JSON response (function not available):`, text.slice(0, 150));
                data = { holdings: [], error: 'Function not available', debug_error: text.slice(0, 100) };
            }
            if (data.debug_error) console.warn(`[holdings:${ticker}]`, data.debug_error);
            setEtpHoldings((prev) => ({ ...prev, [ticker]: data }));
        } catch (err) {
            console.warn('holdings fetch failed', err);
            etpHoldingsFetchedRef.current.delete(ticker);
            setEtpHoldings((prev) => ({ ...prev, [ticker]: { holdings: [], error: err.message } }));
        } finally {
            setLoadingHoldings((prev) => (prev === ticker ? null : prev));
        }
    }, []);

    useEffect(() => {
        if (!selected || selected.quoteType !== 'ETF') return;
        fetchHoldings(selected);
    }, [selected, fetchHoldings]);

    const fetchCapex = useCallback(async (stock) => {
        if (!stock || stock.quoteType !== 'EQUITY') return;
        const ticker = stock.ticker;
        if (capexFetchedRef.current.has(ticker)) return;
        capexFetchedRef.current.add(ticker);
        setLoadingCapex(ticker);
        try {
            const country = stock.country || 'US';
            const res = await fetch(`/api/capex?symbol=${encodeURIComponent(ticker)}&country=${country}`);
            // HTML 에러 페이지(타임아웃/502 등) 방어 처리
            const contentType = res.headers.get('content-type') || '';
            if (!res.ok || !contentType.includes('application/json')) {
                throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
            }
            const data = await res.json();
            setCapexData((prev) => ({ ...prev, [ticker]: data }));
        } catch (err) {
            console.warn('capex fetch failed', err);
            capexFetchedRef.current.delete(ticker);
            setCapexData((prev) => ({ ...prev, [ticker]: { annual: [], error: err.message } }));
        } finally {
            setLoadingCapex((prev) => (prev === ticker ? null : prev));
        }
    }, []);

    useEffect(() => {
        if (!selected || selected.quoteType !== 'EQUITY') return;
        fetchCapex(selected);
    }, [selected, fetchCapex]);

    const fetchMdd = useCallback(async (stock) => {
        const ticker = stock.ticker;
        if (mddFetchedRef.current.has(ticker)) return;
        mddFetchedRef.current.add(ticker);
        setLoadingMdd(ticker);
        try {
            const [res10, res1] = await Promise.all([
                fetch(`/api/mdd?tickers=${encodeURIComponent(ticker)}&years=10`),
                fetch(`/api/mdd?tickers=${encodeURIComponent(ticker)}&years=1`),
            ]);
            const [d10, d1] = await Promise.all([
                res10.ok ? res10.json() : Promise.resolve({}),
                res1.ok ? res1.json() : Promise.resolve({}),
            ]);
            setMddData((prev) => ({
                ...prev,
                [ticker]: {
                    mdd10y: d10[ticker] ?? null,
                    mdd1y: d1[ticker] ?? null,
                },
            }));
        } catch (_) {
            mddFetchedRef.current.delete(ticker);
        } finally {
            setLoadingMdd((prev) => (prev === ticker ? null : prev));
        }
    }, []);

    useEffect(() => {
        if (!selected) return;
        fetchMdd(selected);
    }, [selected, fetchMdd]);

    const handleSearch = useCallback((stock) => {
        setWatchlist((prev) => {
            if (prev.find((s) => s.ticker === stock.ticker)) return prev;
            return [...prev, stock];
        });
        setSelected(stock);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchExchangeRate(controller.signal);
        const timer = setInterval(() => {
            fetchExchangeRate();
        }, 10 * 60 * 1000);

        return () => {
            controller.abort();
            clearInterval(timer);
        };
    }, [fetchExchangeRate]);

    const handleRemove = useCallback((ticker) => {
        setWatchlist((prev) => prev.filter((s) => s.ticker !== ticker));
        setSelected((prev) => (prev && prev.ticker === ticker ? null : prev));
    }, []);

    // ── 동적 title + meta description ──────────────────────────────────
    useEffect(() => {
        const BASE_TITLE = '배당의 민족 – Dividend Master | 배당락일·배당금·배당수익률 실시간 조회';
        const BASE_DESC =
            'SCHD·JEPI·JEPQ 등 월배당·분기배당 ETF와 삼성전자 등 한국 배당주의 배당락일, 지급일, 주당배당금(DPS), 세후 배당수익률을 무료로 실시간 조회하세요.';
        const metaDesc = document.querySelector('meta[name="description"]');

        if (currentPage === 'etf-explorer') {
            document.title = '포트폴리오 엿보기 – ARKK·버크셔 구성종목·현재가 실시간 조회 | 배당의 민족';
            metaDesc?.setAttribute(
                'content',
                'ARKK·버크셔해서웨이 포트폴리오 구성종목, 비중, 현재가, 52주 고점 대비 현재 낙폭을 실시간으로 확인하세요.',
            );
        } else if (selected?.ticker) {
            const name = selected.name || selected.ticker;
            const isKR =
                selected.ticker.endsWith('.KS') ||
                selected.ticker.endsWith('.KQ') ||
                /^[0-9]{6}$/.test(selected.ticker);
            if (isKR) {
                document.title = `${name}(${selected.ticker}) 배당금·배당락일·배당수익률 – 배당의 민족`;
                metaDesc?.setAttribute(
                    'content',
                    `${name}(${selected.ticker}) 배당금, 배당락일, 배당수익률, 지급일을 실시간으로 조회하세요. 세후 배당소득세 15.4% 자동 반영. 배당의 민족 무료 제공`,
                );
            } else {
                document.title = `${name}(${selected.ticker}) 배당금·배당락일·세후 수령액 – 배당의 민족`;
                metaDesc?.setAttribute(
                    'content',
                    `${name}(${selected.ticker}) 배당금, 배당락일, 배당수익률을 실시간 조회하세요. 미국 원천징수 15% 세후 실수령액 자동 계산. 배당의 민족 무료 제공`,
                );
            }
        } else {
            document.title = BASE_TITLE;
            metaDesc?.setAttribute('content', BASE_DESC);
        }
    }, [selected, currentPage]);

    // ── URL 상태 동기화 (공유 링크 생성) ──────────────────────────────
    useEffect(() => {
        const params = new URLSearchParams();
        if (currentPage === 'etf-explorer') {
            params.set('page', 'portfolio');
        } else if (selected?.ticker) {
            params.set('ticker', selected.ticker);
        }
        const newSearch = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState(null, '', window.location.pathname + newSearch);
    }, [selected, currentPage]);

    const rateDisplay = exchangeRate == null ? null : fmtExchangeRate(exchangeRate);
    const rateSuffix = '';
    const rateMeta = exchangeRateUpdatedAt
        ? ` · 실시간 ${new Date(exchangeRateUpdatedAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
          })}${exchangeRateSource ? ` · ${exchangeRateSource}` : ''}`
        : '';

    return (
        <div className="dm-app-shell">
            <KakaoShareButton />
            <header className="dm-topbar">
                <div className="dm-shell-container py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 gap-y-2 sm:gap-4">
                    <div
                        className="flex items-center gap-2.5 flex-shrink-0 cursor-pointer select-none"
                        onClick={() => { setSelected(null); setCurrentPage('main'); }}
                    >
                        <div className="dm-brand-mark">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        <div className="hidden sm:block leading-tight">
                            <p className="text-sm font-black text-slate-900 dark:text-white">배당의 민족</p>
                            <p className="text-[11px] font-semibold text-orange-500">Dividend Master</p>
                        </div>
                    </div>

                    {/* 버튼 그룹 — 모바일에서 로고와 같은 행 오른쪽 정렬 */}
                    <div className="flex items-center gap-2 ml-auto sm:ml-0 flex-shrink-0">
                        {/* ETF 탐색기 탭 버튼 */}
                        <button
                            onClick={() => setCurrentPage(currentPage === 'etf-explorer' ? 'main' : 'etf-explorer')}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors sm:px-3
                                ${
                                    currentPage === 'etf-explorer'
                                        ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600'
                                        : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-orange-300 hover:bg-orange-50/80 dark:border-slate-800/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-orange-500/70 dark:hover:bg-slate-800'
                                }`}
                        >
                            <BarChart2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">포트폴리오 엿보기</span>
                        </button>

                        <button
                            onClick={toggle}
                            className="dm-control px-2.5 sm:px-3"
                        >
                            {dark ? (
                                <Sun className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                            )}
                            <span className="hidden sm:inline">{dark ? '라이트' : '다크'}</span>
                        </button>
                    </div>

                    {/* 검색창 — 모바일에서 두 번째 행 전체 너비 */}
                    <div className="order-last sm:order-none w-full sm:flex-1 sm:flex sm:justify-center">
                        <SearchBar
                            onSelect={handleSearch}
                            onFetch={handleFetchLive}
                            liveCache={liveCache}
                            krStocks={krStocks}
                            krEtfs={krEtfs}
                            krDataReady={krDataReady}
                        />
                    </div>
                </div>
            </header>

            {currentPage === 'etf-explorer' ? (
                <EtfExplorerPage
                    onBack={() => setCurrentPage('main')}
                    krEtfs={krEtfs}
                    krDataReady={krDataReady}
                />
            ) : (
                <main className="dm-shell-container flex-1 py-3 sm:py-6 relative overflow-x-hidden">
                    <div className="dm-panel relative w-full max-w-full overflow-hidden p-3 sm:p-6">
                        <div className="flex w-full min-w-0 flex-col xl:flex-row gap-5 items-start">
                            <WatchlistPanel
                                watchlist={watchlist}
                                selected={selected}
                                onSelect={setSelected}
                                onRemove={handleRemove}
                            />
                            {loadingSymbol ? (
                                <LoadingSkeleton symbol={loadingSymbol} />
                            ) : selected ? (
                                <StockDetailView
                                    stock={selected}
                                    holdingsData={etpHoldings[selected.ticker]}
                                    loadingHoldings={loadingHoldings === selected.ticker}
                                    capexData={capexData[selected.ticker]}
                                    loadingCapex={loadingCapex === selected.ticker}
                                    mddData={mddData[selected.ticker]}
                                    loadingMdd={loadingMdd === selected.ticker}
                                />
                            ) : (
                                <div className="flex-1">
                                    <EmptyState
                                        onPickTicker={handleFetchLive}
                                        exchangeRate={exchangeRate}
                                        exchangeRateUpdatedAt={exchangeRateUpdatedAt}
                                        exchangeRateSource={exchangeRateSource}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            )}

            <PopularStocksGuide />

            <FaqSection />

            <footer className="border-t border-slate-200 dark:border-slate-800 py-3 px-6 mb-[58px]">
                <p className="text-center text-xs text-slate-400 dark:text-slate-600">
                    Dividend Master · {rateDisplay ? `환율 ₩${rateDisplay}/USD${rateSuffix}${rateMeta}` : '환율 로드 중'} · 기준일 {getToday().toISOString().slice(0, 10)}
                </p>
            </footer>

        </div>
    );
}

export default function App() {
    return (
        <ToastProvider>
            <ThemeProvider>
                <DashboardApp />
            </ThemeProvider>
        </ToastProvider>
    );
}
