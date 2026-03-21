/**
 * In-memory cache for local development.
 * State is stored in globalThis to persist across HMR reloads.
 */
import type { CacheLike } from "./types.js";
export declare class MemoryCache implements CacheLike {
    private state;
    constructor();
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: {
        tags?: string[];
        ttl?: number;
    }): Promise<void>;
    expireTag(tags: string[]): Promise<void>;
}
export declare function getMemoryCache(): MemoryCache;
/**
 * Check if memory cache should be used.
 * Returns true when running locally (not on Vercel) and not in integration test mode.
 */
export declare function shouldUseMemoryCache(): boolean;
//# sourceMappingURL=memory-cache.d.ts.map