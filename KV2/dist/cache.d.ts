import type { CacheLike, CachedEntry, KeysPage } from "./types.js";
/**
 * Encode cache keys/tags to be safe for HTTP headers (used by Vercel cache tags).
 * HTTP headers only allow ASCII printable characters (0x20-0x7E), excluding certain chars.
 * We use percent-encoding for non-ASCII and problematic characters, keeping ASCII readable.
 * @internal Exported for testing
 */
export declare function encodeCacheKey(path: string): string;
/** Error handler function type for KVCache error logging */
export type ErrorHandler = (message: string, error: unknown) => void;
export interface KVCacheOptions {
    ttl: number;
    /** Optional cache implementation for testing */
    cache?: CacheLike;
    /** Optional error handler for testing (defaults to console.error) */
    onError?: ErrorHandler;
}
export declare class KVCache {
    private ttl;
    private useProxy;
    private useMemory;
    private injectedCache;
    private errorHandler;
    constructor(options: KVCacheOptions | number);
    private getCache;
    private getCacheKey;
    getCacheTag(path: string): string;
    private sleep;
    get<M>(path: string): Promise<CachedEntry<M> | null>;
    set<M>(path: string, entry: CachedEntry<M>): Promise<void>;
    invalidate(path: string): Promise<void>;
    /** Expire multiple tags in a single call. Same retry logic as invalidate(). */
    invalidateTags(tags: string[]): Promise<void>;
    /** Get a cached range query result. */
    getRange(cacheKey: string): Promise<KeysPage | null>;
    /** Cache a range query result with multiple tags. */
    setRange(cacheKey: string, value: KeysPage, tags: string[]): Promise<void>;
}
//# sourceMappingURL=cache.d.ts.map