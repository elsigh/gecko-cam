import { BlobError, BlobPreconditionFailedError } from "@vercel/blob";
import { MAX_HEADER_SIZE, createBlob, isPureJsonFormat, parseBlob, } from "./blob-format.js";
import { VercelBlobStore } from "./blob-store.js";
import { KVCache, encodeCacheKey } from "./cache.js";
import { noopTracer } from "./tracing.js";
import { TypedKV } from "./typed-kv.js";
import { KVVersionConflictError } from "./types.js";
const DEFAULT_LARGE_VALUE_THRESHOLD = 1024 * 1024; // 1MB
const DEFAULT_CACHE_TTL = 3600; // 1 hour
const BLOB_PREFIX = "cached-kv/";
const VALUE_SUFFIX = ".value";
const HEADER_LENGTH_BYTES = 4;
const MAX_KEY_LENGTH = 2048;
function validatePrefix(prefix, name) {
    if (prefix.endsWith(VALUE_SUFFIX)) {
        throw new Error(`${name} cannot end with "${VALUE_SUFFIX}": ${prefix}`);
    }
}
function validateKey(key) {
    if (!key) {
        throw new Error("Key cannot be empty");
    }
    if (key.includes("\x00")) {
        throw new Error("Key cannot contain null bytes");
    }
    if (key.length > MAX_KEY_LENGTH) {
        throw new Error(`Key exceeds maximum length of ${MAX_KEY_LENGTH} characters`);
    }
}
export class KV2 {
    prefix;
    blobStore;
    cache;
    largeValueThreshold;
    tracer;
    constructor(options = {}) {
        const prefix = options.prefix ?? "";
        if (prefix) {
            validatePrefix(prefix, "Prefix");
        }
        this.prefix = prefix;
        this.blobStore = options.blobStore ?? new VercelBlobStore(options.token);
        this.cache = new KVCache({
            ttl: options.cacheTtl ?? DEFAULT_CACHE_TTL,
            cache: options.cache,
        });
        this.largeValueThreshold =
            options.largeValueThreshold ?? DEFAULT_LARGE_VALUE_THRESHOLD;
        this.tracer = options.tracer ?? noopTracer;
    }
    getFullPath(key) {
        return `${BLOB_PREFIX}${this.prefix}${key}.value`;
    }
    getListPrefix(keyPrefix) {
        return `${BLOB_PREFIX}${this.prefix}${keyPrefix}`;
    }
    stripPrefix(pathname) {
        const fullPrefix = `${BLOB_PREFIX}${this.prefix}`;
        const valueSuffix = ".value";
        if (pathname.startsWith(fullPrefix) && pathname.endsWith(valueSuffix)) {
            return pathname.slice(fullPrefix.length, -valueSuffix.length);
        }
        /* c8 ignore next */
        return pathname;
    }
    /** Range tag for a query prefix (used to invalidate range caches) */
    getRangeTag(keyPrefix) {
        return `range:${encodeCacheKey(this.getListPrefix(keyPrefix))}`;
    }
    /** All range tags that a key mutation should invalidate */
    getRangeTagsForKey(key) {
        const tags = [this.getRangeTag("")];
        let prefix = "";
        for (const char of key) {
            prefix += char;
            tags.push(this.getRangeTag(prefix));
        }
        return tags;
    }
    /** Cache key for a range query */
    getRangeCacheKey(keyPrefix, limit, cursor) {
        const encodedPrefix = encodeCacheKey(this.getListPrefix(keyPrefix));
        const encodedCursor = cursor ? encodeCacheKey(cursor) : "";
        return `range:keys:${encodedPrefix}:${limit}:${encodedCursor}`;
    }
    /**
     * Reads blob header without buffering the entire payload.
     * For binary format (large values), returns a reader positioned at the payload.
     * For pure JSON format (small values), returns the complete buffer.
     */
    async readBlobStreaming(path) {
        const result = await this.blobStore.get(path, { access: "public" });
        if (!result) {
            return null;
        }
        // Capture etag for optimistic locking
        const etag = result.blob.etag ?? "";
        const reader = result.stream.getReader();
        const chunks = [];
        let totalLength = 0;
        // Read first chunk to determine format
        const firstRead = await reader.read();
        /* c8 ignore next 3 -- defensive: empty first chunk from blob stream */
        if (firstRead.done || !firstRead.value) {
            return null;
        }
        chunks.push(firstRead.value);
        totalLength += firstRead.value.length;
        // Check if pure JSON format (first byte is '{')
        if (isPureJsonFormat(Buffer.from([firstRead.value[0]]))) {
            // Pure JSON format - need to read entire blob (value is inline)
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
                totalLength += value.length;
            }
            const buffer = Buffer.concat(chunks);
            const { header } = parseBlob(buffer);
            return { header, buffer, reader: null, overflow: null, etag };
        }
        // Binary format - read just enough for the header
        // First 4 bytes are header length
        /* c8 ignore next 8 -- requires stream to fragment at < 4 bytes */
        while (totalLength < HEADER_LENGTH_BYTES) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error("Unexpected end of stream reading header length");
            }
            chunks.push(value);
            totalLength += value.length;
        }
        // Combine chunks to read header length
        const combined = Buffer.concat(chunks);
        const headerLength = combined.readUInt32BE(0);
        if (headerLength > MAX_HEADER_SIZE) {
            if (reader)
                await reader.cancel();
            throw new RangeError(`Header length ${headerLength} exceeds maximum allowed size (${MAX_HEADER_SIZE})`);
        }
        const headerEnd = HEADER_LENGTH_BYTES + headerLength;
        // Read until we have the complete header
        /* c8 ignore next 8 -- requires stream to fragment within header */
        while (totalLength < headerEnd) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error("Unexpected end of stream reading header");
            }
            chunks.push(value);
            totalLength += value.length;
        }
        // Parse header
        const fullBuffer = Buffer.concat(chunks);
        const headerJson = fullBuffer
            .subarray(HEADER_LENGTH_BYTES, headerEnd)
            .toString("utf-8");
        const header = JSON.parse(headerJson);
        // Any bytes past the header are overflow (start of payload)
        const overflow = totalLength > headerEnd ? fullBuffer.subarray(headerEnd) : null;
        return { header, buffer: null, reader, overflow, etag };
    }
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
    async readBlobStreamingWithConsistencyCheck(path, expectedWriteTime) {
        const BACKOFF_MS = [50, 100, 200, 400];
        for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
            const result = await this.readBlobStreaming(path);
            // No expected writeTime - just return whatever we got
            if (!expectedWriteTime) {
                return result;
            }
            /* c8 ignore start -- consistency retry loop requires simulating blob replication lag */
            // Got nothing - might be stale read after a write
            if (!result) {
                if (attempt < BACKOFF_MS.length) {
                    await this.sleep(BACKOFF_MS[attempt]);
                    continue;
                }
                return null;
            }
            // Check if blob's writeTime is fresh enough
            if (result.header.writeTime &&
                result.header.writeTime >= expectedWriteTime) {
                return result; // Fresh read
            }
            // Stale read - close the reader and retry with backoff
            if (result.reader) {
                await result.reader.cancel();
            }
            if (attempt < BACKOFF_MS.length) {
                await this.sleep(BACKOFF_MS[attempt]);
                continue;
            }
            // Give up - return what we have (might be stale but better than nothing)
            return result;
        }
        return null;
        /* c8 ignore stop */
    }
    /* c8 ignore next 3 -- only used by consistency retry loop */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    serializeValue(value) {
        if (value instanceof Buffer) {
            return { data: value, encoding: "base64" };
        }
        if (value instanceof Uint8Array) {
            return { data: Buffer.from(value), encoding: "base64" };
        }
        if (value instanceof ArrayBuffer) {
            return { data: Buffer.from(value), encoding: "base64" };
        }
        // JSON.stringify(undefined) returns undefined, not a string
        // Handle undefined by serializing as null (JSON standard behavior)
        const jsonStr = JSON.stringify(value);
        if (jsonStr === undefined) {
            // undefined becomes null in JSON
            return { data: Buffer.from("null", "utf-8"), encoding: "json" };
        }
        return {
            data: Buffer.from(jsonStr, "utf-8"),
            encoding: "json",
        };
    }
    deserializeValue(data, encoding) {
        if (encoding === "base64" && typeof data === "string") {
            return Buffer.from(data, "base64");
        }
        return data;
    }
    async getValue(key) {
        validateKey(key);
        const result = await this.get(key);
        return result.exists ? result.value : undefined;
    }
    async get(key) {
        validateKey(key);
        const span = this.tracer.startSpan("kv.get", { key });
        const path = this.getFullPath(key);
        try {
            // Try cache first
            const cached = await this.cache.get(path);
            // If cache has full value (not just writeTime marker) and etag, return it
            if (cached && cached.value !== undefined && cached.etag) {
                span.setAttributes({ source: "cache", size: cached.size });
                span.end();
                // Deserialize binary data from base64 if needed
                const cachedValue = cached.isBinary && typeof cached.value === "string"
                    ? Buffer.from(cached.value, "base64")
                    : cached.value;
                const cachedPayload = this.getPayloadBytes(cachedValue, cached.size);
                let streamPromise = null;
                const cachedEtag = cached.etag;
                return {
                    exists: true,
                    metadata: cached.metadata,
                    version: cachedEtag,
                    get value() {
                        return Promise.resolve(cachedValue);
                    },
                    get stream() {
                        if (!streamPromise) {
                            streamPromise = Promise.resolve(new ReadableStream({
                                start(controller) {
                                    controller.enqueue(cachedPayload);
                                    controller.close();
                                },
                            }));
                        }
                        return streamPromise;
                    },
                    update: async (value, metadata) => {
                        const meta = (metadata ?? cached.metadata);
                        return this.set(key, value, meta, { expectedVersion: cachedEtag });
                    },
                };
            }
            // Read from blob store with streaming (with retry for eventual consistency)
            const streamingResult = await this.readBlobStreamingWithConsistencyCheck(path, cached?.writeTime);
            if (!streamingResult) {
                span.setAttributes({ source: "blob", exists: false });
                span.end();
                return {
                    exists: false,
                    metadata: undefined,
                    value: undefined,
                    stream: undefined,
                };
            }
            const { header, buffer, reader, overflow, etag } = streamingResult;
            // For pure JSON format (small values), buffer is already complete
            if (buffer) {
                span.setAttributes({
                    source: "blob",
                    exists: true,
                    format: "json",
                    size: buffer.length,
                });
                span.end();
                const { payload } = parseBlob(buffer);
                return this.createResultFromBuffer(key, header, payload, buffer, path, etag);
            }
            // For binary format (large values), use streaming
            // reader is guaranteed non-null when buffer is null (binary format)
            /* c8 ignore next 3 -- unreachable by construction */
            if (!reader) {
                throw new Error("Unexpected state: binary format without reader");
            }
            span.setAttributes({ source: "blob", exists: true, format: "streaming" });
            span.end();
            return this.createStreamingResult(key, header, reader, overflow, path, etag);
        }
        catch (error) {
            span.setError(error instanceof Error ? error : new Error(String(error)));
            span.end();
            throw error;
        }
    }
    /**
     * Creates a result from a fully-buffered blob (pure JSON format or cached).
     */
    createResultFromBuffer(key, header, payload, buffer, path, etag) {
        // Determine payload bytes for streaming
        let payloadBytes;
        if (payload) {
            payloadBytes = payload;
        }
        else if (header.encoding === "base64" &&
            typeof header.value === "string") {
            payloadBytes = Buffer.from(header.value, "base64");
        }
        else {
            const jsonStr = JSON.stringify(header.value);
            payloadBytes = Buffer.from(jsonStr ?? "null", "utf-8");
        }
        let valuePromise = null;
        let streamPromise = null;
        const self = this;
        return {
            exists: true,
            metadata: header.metadata,
            version: etag,
            get value() {
                if (!valuePromise) {
                    valuePromise = self.resolveValue(header, payload, path, buffer, etag);
                }
                return valuePromise;
            },
            get stream() {
                if (!streamPromise) {
                    streamPromise = Promise.resolve(new ReadableStream({
                        start(controller) {
                            controller.enqueue(payloadBytes);
                            controller.close();
                        },
                    }));
                }
                return streamPromise;
            },
            update: async (value, metadata) => {
                const meta = (metadata ?? header.metadata);
                return self.set(key, value, meta, { expectedVersion: etag });
            },
        };
    }
    /**
     * Creates a result with true streaming for binary format (large values).
     * The payload is streamed directly from the blob store without buffering.
     */
    createStreamingResult(key, header, reader, overflow, path, etag) {
        let valuePromise = null;
        let streamPromise = null;
        // Shared state for coordinating between value and stream access
        let payloadBuffer = null;
        let streamConsumed = false;
        const self = this;
        // Helper to buffer the remaining payload
        const bufferPayload = async () => {
            if (payloadBuffer) {
                return payloadBuffer;
            }
            if (streamConsumed) {
                throw new Error("Cannot access value after stream has been consumed");
            }
            const chunks = [];
            if (overflow) {
                chunks.push(overflow);
            }
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            payloadBuffer = Buffer.concat(chunks);
            return payloadBuffer;
        };
        return {
            exists: true,
            metadata: header.metadata,
            version: etag,
            get value() {
                if (!valuePromise) {
                    valuePromise = (async () => {
                        const payload = await bufferPayload();
                        let value;
                        let size;
                        let isBinary = false;
                        if (header.encoding === "raw-json") {
                            value = JSON.parse(payload.toString("utf-8"));
                            size = payload.length;
                        }
                        else if (header.encoding === "raw-binary") {
                            value = payload;
                            size = payload.length;
                            isBinary = true;
                        }
                        else {
                            // Shouldn't happen for streaming result, but handle gracefully
                            value = self.deserializeValue(header.value, header.encoding);
                            size = payload.length;
                            isBinary = header.encoding === "base64";
                        }
                        // Cache the result with etag
                        const cachedEntry = {
                            metadata: header.metadata,
                            value: isBinary && value instanceof Buffer
                                ? value.toString("base64")
                                : value,
                            size,
                            isBinary,
                            etag,
                        };
                        await self.cache.set(path, cachedEntry);
                        return value;
                    })();
                }
                return valuePromise;
            },
            get stream() {
                if (!streamPromise) {
                    streamPromise = (async () => {
                        // If value was already buffered, use that
                        if (payloadBuffer) {
                            const bufferedData = payloadBuffer;
                            return new ReadableStream({
                                start(controller) {
                                    controller.enqueue(bufferedData);
                                    controller.close();
                                },
                            });
                        }
                        // Otherwise, stream directly from the reader
                        streamConsumed = true;
                        let overflowSent = false;
                        return new ReadableStream({
                            async pull(controller) {
                                // Send overflow bytes first
                                if (!overflowSent && overflow) {
                                    controller.enqueue(overflow);
                                    overflowSent = true;
                                    return;
                                }
                                const { done, value } = await reader.read();
                                if (done) {
                                    controller.close();
                                    return;
                                }
                                controller.enqueue(value);
                            },
                            /* c8 ignore next 3 -- stream cancel during pull */
                            cancel() {
                                reader.cancel();
                            },
                        });
                    })();
                }
                return streamPromise;
            },
            /* c8 ignore start -- same shape as buffered update, tested via createResultFromBuffer */
            update: async (value, metadata) => {
                const meta = (metadata ?? header.metadata);
                return self.set(key, value, meta, { expectedVersion: etag });
            },
            /* c8 ignore stop */
        };
    }
    async resolveValue(header, payload, path, buffer, etag) {
        let value;
        let size;
        let isBinary = false;
        /* c8 ignore next 8 -- unreachable: resolveValue only called from createResultFromBuffer where payload is always null */
        if (header.encoding === "raw-json" && payload) {
            value = JSON.parse(payload.toString("utf-8"));
            size = payload.length;
        }
        else if (header.encoding === "raw-binary" && payload) {
            value = payload;
            size = payload.length;
            isBinary = true;
        }
        else {
            // Small value inlined in header
            value = this.deserializeValue(header.value, header.encoding);
            size = buffer.length;
            isBinary = header.encoding === "base64";
        }
        // Cache the result with etag - binary data must be serialized as base64 for cache storage
        const cachedEntry = {
            metadata: header.metadata,
            value: isBinary && value instanceof Buffer ? value.toString("base64") : value,
            size,
            isBinary,
            etag,
        };
        await this.cache.set(path, cachedEntry);
        return value;
    }
    getPayloadBytes(value, _size) {
        if (value instanceof Buffer) {
            return value;
        }
        /* c8 ignore next 3 -- only reachable from cache path with Uint8Array value */
        if (value instanceof Uint8Array) {
            return value;
        }
        return Buffer.from(JSON.stringify(value), "utf-8");
    }
    async set(key, value, ...[metadata, options]) {
        validateKey(key);
        if (value === undefined) {
            throw new Error("Cannot store undefined — use null instead");
        }
        const span = this.tracer.startSpan("kv.set", { key });
        const path = this.getFullPath(key);
        try {
            // Handle streaming input - always use large file mode
            if (value instanceof ReadableStream) {
                span.setAttributes({ format: "stream" });
                const writeTime = Date.now();
                const header = {
                    metadata: metadata,
                    encoding: "raw-binary",
                    writeTime,
                };
                const headerBuffer = createBlob(header);
                // Create a combined stream: header + payload
                const headerStream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(headerBuffer);
                        controller.close();
                    },
                });
                const combinedStream = this.concatStreams(headerStream, value);
                const putResult = await this.blobStore.put(path, combinedStream, {
                    access: "private",
                    contentType: "application/octet-stream",
                    cacheControlMaxAge: 60,
                    allowOverwrite: options?.override ?? true,
                    ifMatch: options?.expectedVersion,
                });
                // Invalidate old cache entries via tags
                const keyTag = this.cache.getCacheTag(path);
                if (options?.expectedVersion) {
                    await this.cache.invalidateTags([keyTag]);
                }
                else {
                    const rangeTags = this.getRangeTagsForKey(key);
                    await this.cache.invalidateTags([keyTag, ...rangeTags]);
                }
                // Cache writeTime for consistency checking (can't cache value - stream consumed)
                await this.cache.set(path, {
                    metadata: metadata,
                    value: undefined, // Stream value not available
                    size: 0,
                    writeTime,
                    etag: putResult.etag,
                });
                span.end();
                return { version: putResult.etag ?? "" };
            }
            // Non-streaming path
            const serialized = this.serializeValue(value);
            const isBinary = serialized.encoding === "base64";
            let blobData;
            let cacheValue;
            if (serialized.data.length > this.largeValueThreshold) {
                span.setAttributes({ format: "large", size: serialized.data.length });
                // Large value: store as raw payload after header
                const header = {
                    metadata: metadata,
                    encoding: serialized.encoding === "json" ? "raw-json" : "raw-binary",
                };
                blobData = createBlob(header, serialized.data);
                // Cache the value - binary data as base64 string for cache serialization
                cacheValue =
                    serialized.encoding === "json"
                        ? JSON.parse(serialized.data.toString("utf-8"))
                        : serialized.data.toString("base64"); // Binary: store as base64 for cache
            }
            else {
                span.setAttributes({ format: "inline", size: serialized.data.length });
                // Small value: inline in header
                const headerValue = serialized.encoding === "json"
                    ? JSON.parse(serialized.data.toString("utf-8"))
                    : serialized.data.toString("base64");
                const header = {
                    metadata: metadata,
                    value: headerValue,
                    encoding: serialized.encoding,
                };
                blobData = createBlob(header);
                // Cache the value - binary data as base64 string for cache serialization
                cacheValue =
                    serialized.encoding === "json"
                        ? headerValue
                        : serialized.data.toString("base64"); // Binary: store as base64 for cache
            }
            // Write blob
            const putResult = await this.blobStore.put(path, blobData, {
                access: "private",
                contentType: isBinary ? "application/octet-stream" : "application/json",
                cacheControlMaxAge: 60,
                allowOverwrite: options?.override ?? true,
                ifMatch: options?.expectedVersion,
            });
            // Invalidate old cache entries via tags
            const keyTag = this.cache.getCacheTag(path);
            if (options?.expectedVersion) {
                await this.cache.invalidateTags([keyTag]);
            }
            else {
                const rangeTags = this.getRangeTagsForKey(key);
                await this.cache.invalidateTags([keyTag, ...rangeTags]);
            }
            // Write to cache (provides read-your-writes consistency)
            // Binary values are stored as base64 strings with isBinary flag
            await this.cache.set(path, {
                metadata: metadata,
                value: cacheValue,
                size: serialized.data.length,
                isBinary,
                etag: putResult.etag,
            });
            span.end();
            return { version: putResult.etag ?? "" };
        }
        catch (error) {
            if (error instanceof BlobPreconditionFailedError) {
                span.setError(error);
                span.end();
                throw new KVVersionConflictError(key);
            }
            /* c8 ignore start -- BlobError handling only from real @vercel/blob SDK */
            // Handle BlobError cases from real @vercel/blob:
            // - "This blob already exists" for allowOverwrite: false
            // - "The specified key does not exist" for ifMatch on non-existent key
            if (error instanceof BlobError) {
                const message = error.message ?? "";
                if (message.includes("already exists") ||
                    message.includes("does not exist")) {
                    span.setError(error);
                    span.end();
                    throw new KVVersionConflictError(key);
                }
            }
            /* c8 ignore stop */
            span.setError(error instanceof Error ? error : new Error(String(error)));
            span.end();
            throw error;
        }
    }
    concatStreams(first, second) {
        const reader1 = first.getReader();
        const reader2 = second.getReader();
        let readingFirst = true;
        return new ReadableStream({
            async pull(controller) {
                if (readingFirst) {
                    const { done, value } = await reader1.read();
                    if (done) {
                        readingFirst = false;
                        return this.pull?.(controller);
                    }
                    controller.enqueue(value);
                }
                else {
                    const { done, value } = await reader2.read();
                    if (done) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(value);
                }
            },
            cancel() {
                reader1.cancel();
                reader2.cancel();
            },
        });
    }
    async delete(key) {
        validateKey(key);
        const span = this.tracer.startSpan("kv.delete", { key });
        const path = this.getFullPath(key);
        try {
            // Delete blob (single file now, no separate payload)
            await this.blobStore.del(path);
            // Invalidate value cache + affected range caches
            const keyTag = this.cache.getCacheTag(path);
            const rangeTags = this.getRangeTagsForKey(key);
            await this.cache.invalidateTags([keyTag, ...rangeTags]);
            span.end();
            /* c8 ignore next 5 -- error rethrow path */
        }
        catch (error) {
            span.setError(error instanceof Error ? error : new Error(String(error)));
            span.end();
            throw error;
        }
    }
    keys(prefix) {
        const self = this;
        const listPrefix = this.getListPrefix(prefix ?? "");
        return {
            async *[Symbol.asyncIterator]() {
                const span = self.tracer.startSpan("kv.keys", { prefix: prefix ?? "" });
                let cursor;
                let count = 0;
                try {
                    do {
                        const result = await self.blobStore.list({
                            prefix: listPrefix,
                            cursor,
                        });
                        for (const blob of result.blobs) {
                            if (blob.pathname.endsWith(".value")) {
                                count++;
                                yield self.stripPrefix(blob.pathname);
                            }
                        }
                        cursor = result.cursor;
                    } while (cursor);
                    span.setAttributes({ count });
                    span.end();
                    /* c8 ignore next 7 -- error rethrow path */
                }
                catch (error) {
                    span.setError(error instanceof Error ? error : new Error(String(error)));
                    span.end();
                    throw error;
                }
            },
            async page(limit, cursor) {
                const span = self.tracer.startSpan("kv.keys.page", {
                    prefix: prefix ?? "",
                    limit,
                });
                try {
                    // Check range cache first
                    const rangeCacheKey = self.getRangeCacheKey(prefix ?? "", limit, cursor);
                    const cached = await self.cache.getRange(rangeCacheKey);
                    if (cached) {
                        span.setAttributes({
                            count: cached.keys.length,
                            hasMore: !!cached.cursor,
                            source: "cache",
                        });
                        span.end();
                        return cached;
                    }
                    // Cache miss — fetch from blob store
                    const keys = [];
                    let currentCursor = cursor;
                    while (keys.length < limit) {
                        const result = await self.blobStore.list({
                            prefix: listPrefix,
                            cursor: currentCursor,
                            limit: limit - keys.length,
                        });
                        for (const blob of result.blobs) {
                            if (blob.pathname.endsWith(".value")) {
                                keys.push(self.stripPrefix(blob.pathname));
                                if (keys.length >= limit)
                                    break;
                            }
                        }
                        currentCursor = result.cursor;
                        if (!currentCursor)
                            break;
                    }
                    const page = { keys, cursor: currentCursor };
                    // Cache the result with range tag
                    const rangeTag = self.getRangeTag(prefix ?? "");
                    await self.cache.setRange(rangeCacheKey, page, [rangeTag]);
                    span.setAttributes({
                        count: keys.length,
                        hasMore: !!currentCursor,
                        source: "blob",
                    });
                    span.end();
                    return page;
                    /* c8 ignore next 7 -- error rethrow path */
                }
                catch (error) {
                    span.setError(error instanceof Error ? error : new Error(String(error)));
                    span.end();
                    throw error;
                }
            },
        };
    }
    /**
     * Fetch multiple keys concurrently with bounded concurrency.
     * Returns a Map of key -> entry for all existing keys.
     *
     * @param keys - Array of keys to fetch
     * @param concurrency - Number of concurrent get operations (default: 10)
     */
    async getMany(keys, concurrency = 20) {
        const span = this.tracer.startSpan("kv.getMany", {
            keyCount: keys.length,
            concurrency,
        });
        const results = new Map();
        try {
            // Process keys in batches
            for (let i = 0; i < keys.length; i += concurrency) {
                const batch = keys.slice(i, i + concurrency);
                const batchResults = await Promise.all(batch.map(async (key) => {
                    const result = await this.get(key);
                    return { key, result };
                }));
                for (const { key, result } of batchResults) {
                    if (result.exists) {
                        results.set(key, result);
                    }
                }
            }
            span.setAttributes({ count: results.size });
            span.end();
            return results;
            /* c8 ignore next 5 -- error rethrow path */
        }
        catch (error) {
            span.setError(error instanceof Error ? error : new Error(String(error)));
            span.end();
            throw error;
        }
    }
    /**
     * Iterate over key-value entries with concurrent fetching.
     * Yields [key, entry] pairs as soon as each fetch completes.
     *
     * @param prefix - Optional prefix to filter keys
     * @param concurrency - Number of concurrent get operations (default: 20)
     */
    entries(prefix, concurrency = 20) {
        const self = this;
        return {
            async *[Symbol.asyncIterator]() {
                const span = self.tracer.startSpan("kv.entries", {
                    prefix: prefix ?? "",
                    concurrency,
                });
                let count = 0;
                try {
                    const keyIterator = self.keys(prefix)[Symbol.asyncIterator]();
                    // Pool of in-flight fetches
                    const inFlight = new Map();
                    let keysDone = false;
                    // Start initial batch of fetches
                    while (inFlight.size < concurrency && !keysDone) {
                        const { done, value: key } = await keyIterator.next();
                        if (done) {
                            keysDone = true;
                            break;
                        }
                        inFlight.set(key, self.get(key).then((result) => ({ key, result })));
                    }
                    // Process results as they complete, refilling the pool
                    while (inFlight.size > 0) {
                        const { key, result } = await Promise.race(inFlight.values());
                        inFlight.delete(key);
                        if (result.exists) {
                            count++;
                            yield [key, result];
                        }
                        if (!keysDone) {
                            const { done, value: nextKey } = await keyIterator.next();
                            if (done) {
                                keysDone = true;
                            }
                            else {
                                inFlight.set(nextKey, self
                                    .get(nextKey)
                                    .then((r) => ({ key: nextKey, result: r })));
                            }
                        }
                    }
                    span.setAttributes({ count });
                    span.end();
                    /* c8 ignore next 7 -- error rethrow path */
                }
                catch (error) {
                    span.setError(error instanceof Error ? error : new Error(String(error)));
                    span.end();
                    throw error;
                }
            },
            async page(limit, cursor) {
                const span = self.tracer.startSpan("kv.entries.page", {
                    prefix: prefix ?? "",
                    limit,
                    concurrency,
                });
                try {
                    // Get a page of keys first
                    const { keys, cursor: nextCursor } = await self
                        .keys(prefix)
                        .page(limit, cursor);
                    // Fetch all values concurrently
                    const entriesMap = await self.getMany(keys, concurrency);
                    // Build entries array in key order
                    const entries = [];
                    for (const key of keys) {
                        const entry = entriesMap.get(key);
                        if (entry) {
                            entries.push([key, entry]);
                        }
                    }
                    span.setAttributes({ count: entries.length, hasMore: !!nextCursor });
                    span.end();
                    return { entries, cursor: nextCursor };
                    /* c8 ignore next 7 -- error rethrow path */
                }
                catch (error) {
                    span.setError(error instanceof Error ? error : new Error(String(error)));
                    span.end();
                    throw error;
                }
            },
        };
    }
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
    getStore(subPrefix, indexes) {
        return new TypedKV(this, subPrefix, indexes);
    }
}
//# sourceMappingURL=cached-kv.js.map