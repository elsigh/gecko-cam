/**
 * ProxyCache - A cache implementation that proxies to a deployed cache-proxy endpoint.
 * This allows local development to use the real Vercel cache.
 *
 * Usage:
 *   // Set environment variables:
 *   // CACHE_PROXY_URL=https://cached-kv-poc.vercel.app/api/cache-proxy
 *   // PROTECTION_BYPASS=<your-bypass-token>
 *
 *   import { getProxyCache } from "./proxy-cache.js";
 *   const cache = getProxyCache();
 *   await cache.set("key", { data: "value" }, { ttl: 3600 });
 *   const value = await cache.get("key");
 */
const DEFAULT_CACHE_PROXY_URL = "https://cached-kv-poc.vercel.app/api/cache-proxy";
const REQUEST_TIMEOUT_MS = 10000; // 10 second timeout
/* c8 ignore start -- HTTP proxy class requires real network, tested via re-implementation in proxy-cache.test.ts */
class ProxyCacheImpl {
    proxyUrl;
    protectionBypass;
    constructor(options) {
        this.proxyUrl =
            options?.proxyUrl ??
                process.env.CACHE_PROXY_URL ??
                DEFAULT_CACHE_PROXY_URL;
        this.protectionBypass =
            options?.protectionBypass ?? process.env.PROTECTION_BYPASS;
    }
    getHeaders(contentType) {
        const headers = {};
        if (contentType) {
            headers["Content-Type"] = contentType;
        }
        if (this.protectionBypass) {
            headers["x-vercel-protection-bypass"] = this.protectionBypass;
        }
        return headers;
    }
    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    async get(key) {
        // Pass key in POST body to avoid URL encoding issues with unicode
        const url = `${this.proxyUrl}?op=get`;
        const response = await this.fetchWithTimeout(url, {
            method: "POST",
            headers: this.getHeaders("application/json"),
            body: JSON.stringify({ key }),
        });
        const data = (await response.json());
        if (data.error) {
            throw new Error(data.error);
        }
        return data.value;
    }
    async set(key, value, options) {
        // Pass key in POST body to avoid URL encoding issues with unicode
        const url = `${this.proxyUrl}?op=set`;
        const response = await this.fetchWithTimeout(url, {
            method: "POST",
            headers: this.getHeaders("application/json"),
            body: JSON.stringify({
                key,
                value,
                tags: options?.tags,
                ttl: options?.ttl,
            }),
        });
        const data = (await response.json());
        if (data.error) {
            throw new Error(data.error);
        }
    }
    async expireTag(tags) {
        // Pass tags in POST body to avoid URL encoding issues with unicode
        const url = `${this.proxyUrl}?op=expireTag`;
        const response = await this.fetchWithTimeout(url, {
            method: "POST",
            headers: this.getHeaders("application/json"),
            body: JSON.stringify({ tags }),
        });
        const data = (await response.json());
        if (data.error) {
            throw new Error(data.error);
        }
    }
}
/* c8 ignore stop */
let proxyCacheInstance = null;
/**
 * Get a proxy cache instance for local development.
 * Uses CACHE_PROXY_URL and PROTECTION_BYPASS environment variables.
 */
/* c8 ignore next 6 -- singleton accessor for ProxyCacheImpl */
export function getProxyCache(options) {
    if (!proxyCacheInstance) {
        proxyCacheInstance = new ProxyCacheImpl(options);
    }
    return proxyCacheInstance;
}
/**
 * Check if we should use the proxy cache (running locally with integration tests).
 */
/* c8 ignore next 10 -- env var check, unsafe to test in concurrent test runner */
export function shouldUseProxyCache() {
    // On Vercel, use the native cache
    if (process.env.VERCEL) {
        return false;
    }
    // Only use proxy for integration tests when PROTECTION_BYPASS is set
    if (process.env.INTEGRATION_TEST !== "1") {
        return false;
    }
    // Use proxy if CACHE_PROXY_URL or PROTECTION_BYPASS is set
    return !!(process.env.CACHE_PROXY_URL || process.env.PROTECTION_BYPASS);
}
//# sourceMappingURL=proxy-cache.js.map