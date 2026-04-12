/**
 * fetch wrapper with AbortController timeout (default 5s).
 * Drop-in replacement: fetchWithTimeout(url, opts, timeoutMs)
 */
export const fetchWithTimeout = async (url, opts = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timeoutId);
    }
};
