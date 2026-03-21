import { getMemoryCache, shouldUseMemoryCache } from "./memory-cache.js";
import { getProxyCache, shouldUseProxyCache } from "./proxy-cache.js";
const CACHE_KEY_PREFIX = "cached-kv:";
const MAX_CACHE_SIZE = 1 * 1024 * 1024; // 1MB - keep cache lightweight
const INVALIDATE_RETRIES = 3;
const INVALIDATE_BACKOFF_MS = [100, 500, 1000];
/**
 * Encode cache keys/tags to be safe for HTTP headers (used by Vercel cache tags).
 * HTTP headers only allow ASCII printable characters (0x20-0x7E), excluding certain chars.
 * We use percent-encoding for non-ASCII and problematic characters, keeping ASCII readable.
 * @internal Exported for testing
 */
export function encodeCacheKey(path) {
    let result = "";
    for (const char of path) {
        const code = char.charCodeAt(0);
        // Keep ASCII printable chars except %, ", and + (which we use for space encoding)
        if (code >= 0x21 &&
            code <= 0x7e &&
            char !== "%" &&
            char !== '"' &&
            char !== "+") {
            result += char;
        }
        else if (char === " ") {
            result += "+"; // Space as + for readability
        }
        else if (char === "+") {
            result += "%2B"; // Encode + to avoid collision with space
        }
        else {
            // Percent-encode everything else (unicode, control chars, etc.)
            const encoded = encodeURIComponent(char);
            result += encoded;
        }
    }
    return result;
}
// Lazy import to avoid @vercel/functions initialization message when using proxy
let vercelCache = null;
/* c8 ignore next 7 -- requires Vercel runtime environment */
async function getVercelCache() {
    if (!vercelCache) {
        const { getCache } = await import("@vercel/functions");
        vercelCache = getCache();
    }
    return vercelCache;
}
let loggedProxyUsage = false;
export class KVCache {
    ttl;
    useProxy;
    useMemory;
    injectedCache;
    errorHandler;
    constructor(options) {
        if (typeof options === "number") {
            // Legacy: just TTL
            this.ttl = options;
            this.injectedCache = null;
            this.errorHandler = (msg, err) => console.error(msg, err);
        }
        else {
            this.ttl = options.ttl;
            this.injectedCache = options.cache ?? null;
            this.errorHandler =
                options.onError ?? ((msg, err) => console.error(msg, err));
        }
        this.useProxy = shouldUseProxyCache();
        this.useMemory = shouldUseMemoryCache();
    }
    async getCache() {
        if (this.injectedCache) {
            return this.injectedCache;
        }
        /* c8 ignore next 6 -- proxy cache path only active during integration tests */
        if (this.useProxy) {
            if (!loggedProxyUsage) {
                console.log("[KVCache] Using proxy cache for integration tests");
                loggedProxyUsage = true;
            }
            return getProxyCache();
        }
        if (this.useMemory) {
            return getMemoryCache();
        }
        /* c8 ignore next */
        return getVercelCache();
    }
    getCacheKey(path) {
        return `${CACHE_KEY_PREFIX}${encodeCacheKey(path)}`;
    }
    getCacheTag(path) {
        return `${CACHE_KEY_PREFIX}${encodeCacheKey(path)}`;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async get(path) {
        try {
            const cache = await this.getCache();
            const key = this.getCacheKey(path);
            const result = await cache.get(key);
            return result;
        }
        catch (err) {
            this.errorHandler("[KVCache] cache read failed:", err);
            return null;
        }
    }
    async set(path, entry) {
        // Don't cache entries larger than max size
        if (entry.size > MAX_CACHE_SIZE) {
            return;
        }
        try {
            const cache = await this.getCache();
            const key = this.getCacheKey(path);
            const tag = this.getCacheTag(path);
            await cache.set(key, entry, {
                tags: [tag],
                ttl: this.ttl,
            });
        }
        catch (err) {
            this.errorHandler("[KVCache] cache write failed:", err);
        }
    }
    async invalidate(path) {
        const tag = this.getCacheTag(path);
        let lastError;
        for (let attempt = 0; attempt < INVALIDATE_RETRIES; attempt++) {
            try {
                const cache = await this.getCache();
                await cache.expireTag([tag]);
                return;
            }
            catch (err) {
                lastError = err;
                this.errorHandler(`[KVCache] invalidation failed (attempt ${attempt + 1}/${INVALIDATE_RETRIES}):`, err);
                if (attempt < INVALIDATE_RETRIES - 1) {
                    await this.sleep(INVALIDATE_BACKOFF_MS[attempt]);
                }
            }
        }
        this.errorHandler(`[KVCache] invalidation failed after ${INVALIDATE_RETRIES} retries, giving up:`, lastError);
    }
    /** Expire multiple tags in a single call. Same retry logic as invalidate(). */
    async invalidateTags(tags) {
        let lastError;
        for (let attempt = 0; attempt < INVALIDATE_RETRIES; attempt++) {
            try {
                const cache = await this.getCache();
                await cache.expireTag(tags);
                return;
            }
            catch (err) {
                lastError = err;
                this.errorHandler(`[KVCache] tag invalidation failed (attempt ${attempt + 1}/${INVALIDATE_RETRIES}):`, err);
                if (attempt < INVALIDATE_RETRIES - 1) {
                    await this.sleep(INVALIDATE_BACKOFF_MS[attempt]);
                }
            }
        }
        this.errorHandler(`[KVCache] tag invalidation failed after ${INVALIDATE_RETRIES} retries, giving up:`, lastError);
    }
    /** Get a cached range query result. */
    async getRange(cacheKey) {
        try {
            const cache = await this.getCache();
            const result = await cache.get(cacheKey);
            return result;
        }
        catch (err) {
            this.errorHandler("[KVCache] range cache read failed:", err);
            return null;
        }
    }
    /** Cache a range query result with multiple tags. */
    async setRange(cacheKey, value, tags) {
        try {
            const cache = await this.getCache();
            await cache.set(cacheKey, value, {
                tags,
                ttl: this.ttl,
            });
        }
        catch (err) {
            this.errorHandler("[KVCache] range cache write failed:", err);
        }
    }
}
//# sourceMappingURL=cache.js.map