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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// ─────────────────────────────────────────────
// 2. 프리셋 티커 (표시용)
// ─────────────────────────────────────────────
const PRESET_TICKERS = ['QQQ', 'SCHD', 'JEPI', 'JEPQ', 'AAPL', 'MSFT', 'KO', 'T', 'O', '005930', '000660'];
const CACHE_VERSION = 3; // 버전 올리면 모든 stale 캐시 자동 파기

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

function SearchBar({ onSelect, onFetch, liveCache }) {
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

    const mergedResults = [];
    const seen = new Set();

    cacheResults.forEach((s) => {
        const t = s.ticker.toUpperCase();
        if (seen.has(t)) return;
        seen.add(t);
        mergedResults.push({ ...s, _source: 'cache' });
    });

    suggestions.forEach((s) => {
        const t = s.symbol.toUpperCase();
        if (seen.has(t)) return;
        seen.add(t);
        mergedResults.push({
            ticker: t,
            name: s.shortname || s.longname || t,
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

    const hasDropdown = open && (mergedResults.length > 0 || loadingSuggest || errorSuggest);

    return (
        <div ref={wrapRef} className="relative w-full max-w-xl">
            <div
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl
        bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/60 dark:border-slate-800/70
        shadow-lg shadow-black/5 focus-within:ring-2 focus-within:ring-orange-400 transition-all"
            >
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                    type="text"
                    value={query}
                    placeholder="티커 또는 종목명 검색  (예: SCHD, 삼성전자)"
                    className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-200
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
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/60 dark:border-slate-800/70"
                >
                    {loadingSuggest && (
                        <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">검색 중...</div>
                    )}
                    {errorSuggest && (
                        <div className="px-4 py-3 text-sm text-red-500 dark:text-red-400">{errorSuggest}</div>
                    )}
                    {!loadingSuggest && !errorSuggest && mergedResults.length === 0 && q.length > 0 && (
                        <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">검색 결과 없음</div>
                    )}
                    {mergedResults.map((s) => {
                        const isSuggestion = s._source === 'suggestion';
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
                                        {s.ticker}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {s.name || s.longName || s.shortName || s.exchange || ''}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                        {yieldText}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {freqText}
                                        {!isSuggestion && dd !== null && ' · D' + (dd >= 0 ? '-' : '+') + Math.abs(dd)}
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
            <aside className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-3 pt-1">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    관심 목록
                </h2>
                <div
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl
          bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-dashed border-white/60 dark:border-slate-800/70
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
        <aside className="w-full xl:w-72 flex-shrink-0 flex flex-col gap-2 pt-1">
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
                                    ? 'border-orange-300/80 shadow-orange-200/60'
                                    : 'border-white/60 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-500')
                            }
                            onClick={() => onSelect(s)}
                        >
                            <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                    <p
                                        className={
                                            'text-sm font-bold leading-tight ' +
                                            (isActive ? 'text-white' : 'text-slate-800 dark:text-slate-100')
                                        }
                                    >
                                        {s.ticker}
                                    </p>
                                    <p
                                        className={
                                            'text-xs truncate ' +
                                            (isActive ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400')
                                        }
                                    >
                                        {s.name}
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
                                        (isActive ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400')
                                    }
                                >
                                    {freqLabel[s.frequency]}
                                </span>
                                <span
                                    className={
                                        'text-sm font-bold ' +
                                        (isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400')
                                    }
                                >
                                    {s.dividendYield.toFixed(2)}%
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
    const growthPositive = stock.dividendGrowthRate >= 0;
    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/50 dark:border-slate-800/60 p-5 shadow-2xl shadow-black/10">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
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
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{stock.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{stock.sector}</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 ml-auto">
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
                    <MetricChip
                        label="배당 성장률 (YoY)"
                        value={(growthPositive ? '+' : '') + stock.dividendGrowthRate.toFixed(1) + '%'}
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        highlight={growthPositive ? 'emerald' : 'red'}
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
            bg-white/60 dark:bg-slate-800/70 backdrop-blur border border-white/50 dark:border-slate-700/60 shadow-sm"
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
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/50 dark:border-slate-800/70 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
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

            <div className="flex flex-col gap-3">
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

                                        <div className="p-1.5 flex flex-col gap-1.5 min-h-[80px]">
                                            {!hasEvent && (
                                                <div className="flex items-center justify-center h-full min-h-[60px]">
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
                                                        <p
                                                            className={
                                                                'text-[9px] font-semibold ' +
                                                                (dd === 0
                                                                    ? 'text-orange-600'
                                                                    : isPast
                                                                      ? 'text-slate-400'
                                                                      : 'text-red-500 dark:text-red-400')
                                                            }
                                                        >
                                                            {dd === 0
                                                                ? '오늘!'
                                                                : isPast
                                                                  ? Math.abs(dd) + 'd ago'
                                                                  : 'D-' + dd}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                            {monthData.pay.map((ev, i) => {
                                                const dd = dDay(ev.payDate);
                                                const isPast = dd < 0;
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
                                                        <p
                                                            className={
                                                                'text-[9px] font-semibold ' +
                                                                (isPast
                                                                    ? 'text-slate-400'
                                                                    : 'text-emerald-600 dark:text-emerald-400')
                                                            }
                                                        >
                                                            {isPast ? Math.abs(dd) + 'd ago' : 'D-' + dd}
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
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/50 dark:border-slate-800/70 shadow-xl overflow-hidden">
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
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/50 dark:border-slate-800/70 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
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
          bg-white/60 dark:bg-slate-800/70 backdrop-blur border border-white/50 dark:border-slate-700
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

            <div className="grid grid-cols-2 gap-2.5">
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
    const tooltipBg = dark ? '#1e293b' : '#ffffff';
    const tooltipBorder = dark ? '#334155' : '#e2e8f0';

    const data = stock.events.map((ev, i) => ({
        label: `${i + 1}회 (${fmtMD(ev.exDate)})`,
        dps: ev.dps,
        net: parseFloat((ev.dps * (1 - stock.taxRate)).toFixed(4)),
    }));

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || !payload.length) return null;
        return (
            <div
                className="rounded-xl shadow-lg p-3 text-xs"
                style={{ background: tooltipBg, border: '1px solid ' + tooltipBorder }}
            >
                <p className="font-semibold mb-1">{label}</p>
                <p className="text-indigo-500 dark:text-indigo-400">
                    세전: {fmtNum(payload[0] && payload[0].value, stock.currency)}
                </p>
                <p className="text-emerald-500 dark:text-emerald-400">
                    세후: {fmtNum(payload[1] && payload[1].value, stock.currency)}
                </p>
            </div>
        );
    };

    return (
        <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/50 dark:border-slate-800/70 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">회차별 주당 배당금 (DPS)</h2>
                <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" />
                        세전
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                        세후
                    </span>
                </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={18} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis
                        tick={{ fill: axisColor, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => fmtNum(v, stock.currency)}
                        width={65}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: dark ? '#1e293b66' : '#f1f5f966' }} />
                    <Bar dataKey="dps" fill="#818cf8" radius={[4, 4, 0, 0]} name="세전" />
                    <Bar dataKey="net" fill="#10b981" radius={[4, 4, 0, 0]} name="세후" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─────────────────────────────────────────────
// 12. EmptyState
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
// 13. StockDetailView
// ─────────────────────────────────────────────
function StockDetailView({ stock, exchangeRate = DEFAULT_EXCHANGE_RATE }) {
    return (
        <div className="flex-1 flex flex-col gap-4 min-w-0">
            <StockInfoHeader stock={stock} />
            <DividendTimeline stock={stock} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <DividendTable stock={stock} />
                <div className="flex flex-col gap-4">
                    <DividendCalculator stock={stock} exchangeRate={exchangeRate} />
                    <DpsBarChart stock={stock} />
                </div>
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

    const fetchLiveStock = useCallback(async (symbolInput) => {
        const raw = symbolInput.trim();
        const normalized = normalizeSymbol(raw);
        if (!normalized) throw new Error('티커를 입력하세요');

        let resolvedSymbol = normalized;
        let krShortName = null;
        let krLongName = null;
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
            sd.dividendYield ?? sd.yield ?? sd.trailingAnnualDividendYield ?? quote.trailingAnnualDividendYield ?? null;
        // yahoo-finance2는 소수(0.05 = 5%) 반환 → 항상 *100
        let dividendYield = rawYield != null ? rawYield * 100 : price && annualDPS ? (annualDPS / price) * 100 : 0;
        const name = quote.longName || quote.shortName || quote.symbol || resolvedSymbol.toUpperCase();
        const baseSymbol = normalized;
        const country = currency === 'KRW' ? 'KR' : 'US';
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
        try {
            const fromYear = CURRENT_YEAR - 2;
            const divRes = await fetch(
                `/api/dividends?symbol=${encodeURIComponent(resolvedSymbol)}&from=${fromYear}-01-01`,
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

        // YoY 배당 성장률 계산 (연도별 DPS 합계 비교, 현재 연도는 연율화)
        let dividendGrowthRate = 0;
        {
            const now = new Date();
            const nowYear = now.getFullYear();
            const dpsByYear = {};
            for (const ev of events) {
                const yr = parseDate(ev.exDate).getFullYear();
                if (!Number.isNaN(yr)) dpsByYear[yr] = (dpsByYear[yr] || 0) + (Number(ev.dps) || 0);
            }

            const years = Object.keys(dpsByYear)
                .map(Number)
                .filter((y) => !Number.isNaN(y))
                .sort((a, b) => b - a);

            const annualized = (year) => {
                const sum = dpsByYear[year] || 0;
                if (year !== nowYear) return sum;
                const month = Math.max(1, Math.min(12, now.getMonth() + 1));
                return sum * (12 / month);
            };

            if (years.length >= 2) {
                const latest = years[0];
                const prev = years[1];
                const base = annualized(prev); // prev는 완료 연도일 가능성이 높음
                const cmp = annualized(latest);
                if (base > 0 && Number.isFinite(cmp)) {
                    dividendGrowthRate = ((cmp - base) / base) * 100;
                }
            } else if (years.length === 1) {
                const onlyYear = years[0];
                if (onlyYear !== nowYear) {
                    // 비교할 상대가 없으면 유지 (0)
                } else {
                    // 현재 연도만 있는 경우: 직전 연도 배당 없음 → 0 유지
                }
            }
        }

        return {
            ticker: (quote.symbol || resolvedSymbol).toUpperCase(),
            name,
            aliases,
            country,
            currency,
            quoteType,
            currentPrice: Number(price) || 0,
            dividendYield: Number(dividendYield.toFixed(2)),
            annualDPS: Number(annualDPS) || 0,
            frequency,
            dividendGrowthRate: Number(dividendGrowthRate.toFixed(1)),
            taxRate,
            sector,
            description: `${name} · Yahoo Finance 실시간 데이터`,
            events,
        };
    }, []);

    const fetchExchangeRate = useCallback(async () => {
        const tryFetch = async (url, extract) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('fx fetch failed');
            const data = await res.json();
            const val = extract(data);
            const next = Number(val);
            if (Number.isFinite(next) && next > 0) return next;
            throw new Error('invalid fx data');
        };

        const pipelines = [
            () => tryFetch('https://api.exchangerate.host/latest?base=USD&symbols=KRW', (d) => d?.rates?.KRW),
            () => tryFetch('https://open.er-api.com/v6/latest/USD', (d) => d?.rates?.KRW),
        ];

        for (const fn of pipelines) {
            try {
                const rate = await fn();
                setExchangeRate(rate);
                setExchangeRateUpdatedAt(new Date().toISOString());
                return rate;
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
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-20 -left-24 w-72 h-72 bg-white/30 dark:bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-orange-200/30 dark:bg-amber-500/10 rounded-full blur-3xl" />
            </div>
            <header
                className="sticky top-0 z-40 bg-white/60 dark:bg-slate-900/50 backdrop-blur-xl
        border-b border-white/40 dark:border-slate-800/60 shadow-lg"
            >
                <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
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
                        <SearchBar onSelect={handleSearch} onFetch={handleFetchLive} liveCache={liveCache} />
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

            <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 relative">
                <div
                    className="absolute inset-0 rounded-[32px] bg-white/20 dark:bg-slate-900/20 blur-3xl"
                    aria-hidden
                />
                <div className="relative rounded-[28px] border border-white/50 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/50 backdrop-blur-2xl shadow-2xl shadow-black/10 p-4 sm:p-6">
                    <div className="flex flex-col xl:flex-row gap-5 items-start">
                        <WatchlistPanel
                            watchlist={watchlist}
                            selected={selected}
                            onSelect={setSelected}
                            onRemove={handleRemove}
                        />
                        {selected ? (
                            <StockDetailView stock={selected} exchangeRate={exchangeRate} />
                        ) : (
                            <div className="flex-1">
                                <EmptyState onPickTicker={handleFetchLive} />
                            </div>
                        )}
                    </div>
                </div>
            </main>

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
