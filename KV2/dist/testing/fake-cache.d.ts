/**
 * Fake cache implementation for testing KVCache without @vercel/functions.
 * Supports programmatic control over success/failure and inspection of calls.
 */
import type { CacheLike } from "../types.js";
export interface CacheCall {
    method: "get" | "set" | "expireTag";
    args: unknown[];
    timestamp: number;
}
export declare class FakeCache implements CacheLike {
    private data;
    private tags;
    private calls;
    private getError;
    private setError;
    private expireTagError;
    private getErrorOnce;
    private setErrorOnce;
    private expireTagErrorOnce;
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: {
        tags?: string[];
        ttl?: number;
    }): Promise<void>;
    expireTag(tags: string[]): Promise<void>;
    /** Set a value directly (bypassing set() tracking) */
    inject(key: string, value: unknown): void;
    /** Clear all data and call history */
    clear(): void;
    /** Get all recorded calls */
    getCalls(): CacheCall[];
    /** Get calls for a specific method */
    getCallsFor(method: "get" | "set" | "expireTag"): CacheCall[];
    /** Clear call history only */
    clearCalls(): void;
    /** Make get() always throw */
    failGet(error: Error): void;
    /** Make set() always throw */
    failSet(error: Error): void;
    /** Make expireTag() always throw */
    failExpireTag(error: Error): void;
    /** Make get() throw once, then succeed */
    failGetOnce(error: Error): void;
    /** Make set() throw once, then succeed */
    failSetOnce(error: Error): void;
    /** Make expireTag() throw once, then succeed */
    failExpireTagOnce(error: Error): void;
    /** Check if a key exists */
    has(key: string): boolean;
    /** Get raw data (for inspection) */
    getData(key: string): unknown;
}
//# sourceMappingURL=fake-cache.d.ts.map