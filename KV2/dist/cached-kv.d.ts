import { TypedKV } from "./typed-kv.js";
import type { EntriesIterable, KV2Options, KVEntry, KVGetResult, KVLike, KVSetResult, KeysIterable, SetOptions } from "./types.js";
export declare class KV2<M = undefined> implements KVLike<M> {
    private prefix;
    private blobStore;
    private cache;
    private largeValueThreshold;
    private tracer;
    constructor(options?: KV2Options);
    private getFullPath;
    private getListPrefix;
    private stripPrefix;
    /** Range tag for a query prefix (used to invalidate range caches) */
    private getRangeTag;
    /** All range tags that a key mutation should invalidate */
    private getRangeTagsForKey;
    /** Cache key for a range query */
    private getRangeCacheKey;
    /**
     * Reads blob header without buffering the entire payload.
     * For binary format (large values), returns a reader positioned at the payload.
     * For pure JSON format (small values), returns the complete buffer.
     */
    private readBlobStreaming;
    /**
     * Streaming version of readBlobWithConsistencyCheck.
     * Returns header and a reader for the payload without buffering.
     */
    /**
     * Read a blob with retry logic to handle eventual consistency after writes.
     *
     * When a cache entry exists with a `writeTime`, we know a write happened
     * recently. The blob store may serve a stale version (or 404) due to
     * replication lag. This method retries with exponential backoff (50ms,
     * 100ms, 200ms, 400ms) until the blob's `writeTime` is >= the expected
     * value, confirming we're reading the latest version.
     *
     * Without `expectedWriteTime`, returns the first result immediately
     * (no retries).
     */
    private readBlobStreamingWithConsistencyCheck;
    private sleep;
    private serializeValue;
    private deserializeValue;
    getValue<V = unknown>(key: string): Promise<V | undefined>;
    get<V = unknown>(key: string): Promise<KVGetResult<V, M>>;
    /**
     * Creates a result from a fully-buffered blob (pure JSON format or cached).
     */
    private createResultFromBuffer;
    /**
     * Creates a result with true streaming for binary format (large values).
     * The payload is streamed directly from the blob store without buffering.
     */
    private createStreamingResult;
    private resolveValue;
    private getPayloadBytes;
    set<V = unknown>(key: string, value: V | ReadableStream<Uint8Array>, ...[metadata, options]: undefined extends M ? [M?, SetOptions?] : [M, SetOptions?]): Promise<KVSetResult>;
    private concatStreams;
    delete(key: string): Promise<void>;
    keys(prefix?: string): KeysIterable;
    /**
     * Fetch multiple keys concurrently with bounded concurrency.
     * Returns a Map of key -> entry for all existing keys.
     *
     * @param keys - Array of keys to fetch
     * @param concurrency - Number of concurrent get operations (default: 10)
     */
    getMany<V = unknown>(keys: string[], concurrency?: number): Promise<Map<string, KVEntry<V, M>>>;
    /**
     * Iterate over key-value entries with concurrent fetching.
     * Yields [key, entry] pairs as soon as each fetch completes.
     *
     * @param prefix - Optional prefix to filter keys
     * @param concurrency - Number of concurrent get operations (default: 20)
     */
    entries<V = unknown>(prefix?: string, concurrency?: number): EntriesIterable<V, M>;
    /**
     * Create a typed sub-store with a key prefix.
     * Chain `.withIndexes()` to add secondary indexes.
     *
     * @example
     * ```ts
     * const users = kv.getStore<User>("users/").withIndexes({
     *   byEmail: { key: (u) => u.email, unique: true },
     * });
     * ```
     */
    getStore<V, SubM = M, I extends string = never>(subPrefix: string, indexes?: Record<I, import("./typed-kv.js").IndexDef<V>>): TypedKV<V, SubM, I>;
}
//# sourceMappingURL=cached-kv.d.ts.map