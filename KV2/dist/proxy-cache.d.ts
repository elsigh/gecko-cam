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
interface CacheSetOptions {
    tags?: string[];
    ttl?: number;
}
export interface ProxyCache {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: CacheSetOptions): Promise<void>;
    expireTag(tags: string[]): Promise<void>;
}
export interface ProxyCacheOptions {
    /** Base URL of the cache-proxy endpoint */
    proxyUrl?: string;
    /** Protection bypass token for Vercel deployment protection */
    protectionBypass?: string;
}
/**
 * Get a proxy cache instance for local development.
 * Uses CACHE_PROXY_URL and PROTECTION_BYPASS environment variables.
 */
export declare function getProxyCache(options?: ProxyCacheOptions): ProxyCache;
/**
 * Check if we should use the proxy cache (running locally with integration tests).
 */
export declare function shouldUseProxyCache(): boolean;
export {};
//# sourceMappingURL=proxy-cache.d.ts.map