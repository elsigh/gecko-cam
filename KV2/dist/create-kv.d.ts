import { KV2 } from "./cached-kv.js";
import type { BlobStore, CacheLike, Tracer } from "./types.js";
export interface CreateKVOptions {
    /**
     * User-defined prefix within the env/branch namespace.
     * Example: "users/" -> cached-kv/production/main/users/{key}.value
     */
    prefix?: string;
    /**
     * Override the environment. Defaults to VERCEL_ENV.
     * Useful for local development or testing.
     */
    env?: string;
    /**
     * Override the branch. Defaults to VERCEL_GIT_COMMIT_REF.
     * Useful for local development or testing.
     */
    branch?: string;
    /**
     * Blob access token (defaults to BLOB_READ_WRITE_TOKEN).
     * When no token is found and not running on Vercel, falls back to
     * local disk storage automatically.
     */
    token?: string;
    /**
     * Blob store implementation (defaults to VercelBlobStore).
     * When omitted and no token is available, automatically falls back to
     * DiskBlobStore in local dev environments.
     */
    blobStore?: BlobStore;
    /**
     * Cache implementation for testing (defaults to Vercel Runtime Cache).
     */
    cache?: CacheLike;
    /**
     * Cache TTL in seconds (default: 3600).
     */
    cacheTtl?: number;
    /**
     * Byte threshold for large value separation (default: 1MB).
     */
    largeValueThreshold?: number;
    /**
     * Tracer for performance monitoring (defaults to no-op).
     */
    tracer?: Tracer;
}
/**
 * Create a KV store with automatic environment detection.
 *
 * @example
 * ```ts
 * // Auto-detect environment
 * const kv = createKV();
 *
 * // Explicit env/branch
 * const kv = createKV({ env: 'production', branch: 'main' });
 * ```
 */
export declare function createKV<M = undefined>(options?: CreateKVOptions): KV2<M>;
//# sourceMappingURL=create-kv.d.ts.map