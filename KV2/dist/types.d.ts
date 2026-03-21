import type { Readable } from "node:stream";
import type { GetBlobResult, GetCommandOptions, ListBlobResult, ListCommandOptions, PutBlobResult, PutCommandOptions } from "@vercel/blob";
/**
 * Result of a set operation.
 */
export interface KVSetResult {
    /** Version (etag) of the written blob, for use with optimistic locking */
    version: string;
}
/**
 * Options for set operations.
 */
export interface SetOptions {
    /** Only succeed if current version matches (optimistic locking) */
    expectedVersion?: string;
    /** Allow overwriting existing values. Default: true */
    override?: boolean;
}
/**
 * Error thrown when a conditional update fails due to version mismatch.
 */
export declare class KVVersionConflictError extends Error {
    constructor(key: string);
}
/**
 * Error thrown when a unique index constraint is violated.
 */
export declare class KVIndexConflictError extends Error {
    indexName: string;
    /** The conflicting index key value (available for programmatic access, not included in message) */
    indexKey: string;
    constructor(indexName: string, indexKey: string);
}
export interface KVEntry<V, M> {
    exists: true;
    metadata: M;
    /** Lazily buffers and parses the value on first access */
    value: Promise<V>;
    /** Lazily returns a stream of the raw payload bytes */
    stream: Promise<ReadableStream<Uint8Array>>;
    /** Version (etag) of this entry, for use with optimistic locking */
    version: string;
    /** Conditionally update using the version from when this entry was read */
    update(value: V | ReadableStream<Uint8Array>, metadata?: M): Promise<KVSetResult>;
}
export interface KVEntryNotFound {
    exists: false;
    metadata: undefined;
    value: undefined;
    stream: undefined;
}
export type KVGetResult<V, M> = KVEntry<V, M> | KVEntryNotFound;
/**
 * Result of a paginated keys query.
 */
export interface KeysPage {
    keys: string[];
    cursor?: string;
}
/**
 * Result of a paginated entries query.
 */
export interface EntriesPage<V, M> {
    entries: [string, KVEntry<V, M>][];
    cursor?: string;
}
/**
 * AsyncIterable for keys with pagination support.
 */
export interface KeysIterable extends AsyncIterable<string> {
    /**
     * Fetch a page of keys.
     * @param limit - Maximum number of keys to return
     * @param cursor - Cursor from previous page (undefined for first page)
     */
    page(limit: number, cursor?: string): Promise<KeysPage>;
}
/**
 * AsyncIterable for entries with pagination support.
 */
export interface EntriesIterable<V, M> extends AsyncIterable<[string, KVEntry<V, M>]> {
    /**
     * Fetch a page of entries.
     * @param limit - Maximum number of entries to return
     * @param cursor - Cursor from previous page (undefined for first page)
     */
    page(limit: number, cursor?: string): Promise<EntriesPage<V, M>>;
}
/**
 * Common interface for KV stores (KV2 and UpstreamKV).
 * Used by TypedKV to support both as parents.
 */
export interface KVLike<M> {
    get<V = unknown>(key: string): Promise<KVGetResult<V, M>>;
    getValue<V = unknown>(key: string): Promise<V | undefined>;
    set<V = unknown>(key: string, value: V | ReadableStream<Uint8Array>, metadata?: M, options?: SetOptions): Promise<KVSetResult>;
    delete(key: string): Promise<void>;
    keys(prefix?: string): KeysIterable;
    entries<V = unknown>(prefix?: string): EntriesIterable<V, M>;
    getMany<V = unknown>(keys: string[], concurrency?: number): Promise<Map<string, KVEntry<V, M>>>;
    getStore<V, SubM = M, I extends string = never>(subPrefix: string, indexes?: Record<I, import("./typed-kv.js").IndexDef<V>>): import("./typed-kv.js").TypedKV<V, SubM, I>;
}
/** A string that ends with a forward slash */
export type PrefixString = `${string}/`;
/** Cache interface for KVCache dependency injection */
export interface CacheLike {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, options?: {
        tags?: string[];
        ttl?: number;
    }): Promise<void>;
    expireTag(tags: string[]): Promise<void>;
}
export interface KV2Options {
    /** Global prefix for all keys (must end with /) */
    prefix?: PrefixString;
    /** Blob access token (defaults to BLOB_READ_WRITE_TOKEN) */
    token?: string;
    /** Byte threshold for large value separation (default: 1MB) */
    largeValueThreshold?: number;
    /** Cache TTL in seconds (default: 3600) */
    cacheTtl?: number;
    /** Blob store implementation (defaults to VercelBlobStore) */
    blobStore?: BlobStore;
    /** Cache implementation for testing (defaults to Vercel Runtime Cache) */
    cache?: CacheLike;
    /** Tracer for performance monitoring (defaults to no-op) */
    tracer?: Tracer;
}
/** Tracer interface for pluggable tracing (OTEL compatible) */
export interface Tracer {
    startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}
/** Span interface for tracing */
export interface Span {
    setAttributes(attrs: Record<string, string | number | boolean>): void;
    setError(error: Error): void;
    end(): void;
}
/**
 * Blob Storage Format (v1)
 *
 * Two formats based on whether payload exists:
 *
 * 1. Pure JSON (small values, no payload):
 *    If first byte is '{' (0x7B), entire blob is JSON header.
 *
 *    {"metadata":{"v":1},"value":{"name":"Alice"},"encoding":"json"}
 *    {"metadata":{"v":1},"value":"SGVsbG8=","encoding":"base64"}
 *
 * 2. Binary format (large values with payload after header):
 *    [4 bytes: header length (uint32 BE)][header JSON][payload bytes]
 *
 *    00 00 00 28 {"metadata":{"v":1},"encoding":"raw-json"}{"name":"Alice",...}
 *    00 00 00 2A {"metadata":{"v":1},"encoding":"raw-binary"}<raw bytes>
 *
 * Detection: check if buffer[0] === 0x7B ('{')
 *   - Yes: pure JSON, parse entire buffer
 *   - No: binary format, read 4-byte length prefix first
 *
 * Safety: Header size capped at 100MB ensures uint32 BE first byte < 0x7B,
 * preventing ambiguity (0x7B000000 = ~2GB would be needed for conflict).
 *
 * Small values (< largeValueThreshold) use pure JSON with inlined "value".
 * Large values use binary format with "raw-json" or "raw-binary" encoding.
 */
export type StoredEntryEncoding = "json" | "base64" | "raw-json" | "raw-binary";
export interface StoredEntry<M> {
    metadata: M;
    /** Inline value for small entries (when encoding is "json" or "base64") */
    value?: unknown;
    /**
     * Encoding type:
     * - "json": inline JSON value
     * - "base64": inline base64-encoded binary
     * - "raw-json": raw JSON payload after header (large JSON values)
     * - "raw-binary": raw binary payload after header (large binary values)
     */
    encoding: StoredEntryEncoding;
    /** Timestamp of the write (for consistency checking) */
    writeTime?: number;
}
export type PutBody = string | Readable | Buffer | Blob | ArrayBuffer | ReadableStream | File;
export interface BlobStore {
    get(pathname: string, options: GetCommandOptions): Promise<GetBlobResult | null>;
    put(pathname: string, body: PutBody, options: PutCommandOptions): Promise<PutBlobResult>;
    del(urlOrPathname: string | string[]): Promise<void>;
    list(options?: ListCommandOptions): Promise<ListBlobResult>;
}
export interface CachedEntry<M> {
    metadata: M;
    /** Value - binary data is stored as base64 string */
    value: unknown;
    size: number;
    /** Whether the value is binary (stored as base64) */
    isBinary?: boolean;
    /** Timestamp of the write (for stream consistency checking) */
    writeTime?: number;
    /** Etag for optimistic locking */
    etag?: string;
}
//# sourceMappingURL=types.d.ts.map