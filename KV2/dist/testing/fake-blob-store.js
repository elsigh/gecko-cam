import { BlobPreconditionFailedError, } from "@vercel/blob";
let etagCounter = 0;
function generateEtag() {
    return `"fake-etag-${++etagCounter}-${Date.now()}"`;
}
async function toBuffer(body) {
    if (typeof body === "string") {
        return Buffer.from(body, "utf-8");
    }
    if (body instanceof Buffer) {
        return body;
    }
    if (body instanceof Blob) {
        const arrayBuffer = await body.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    if (body instanceof ArrayBuffer) {
        return Buffer.from(body);
    }
    if (ArrayBuffer.isView(body)) {
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    }
    if (body instanceof ReadableStream) {
        const chunks = [];
        const reader = body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            chunks.push(value);
        }
        return Buffer.concat(chunks);
    }
    throw new Error("Unsupported body type");
}
export class FakeBlobStore {
    blobs = new Map();
    locks = new Map();
    /**
     * Serialize writes to the same key to prevent race conditions
     * where concurrent callers all pass precondition checks before
     * any write lands.
     */
    async withLock(pathname, fn) {
        // Wait for any in-flight write to this key
        while (this.locks.has(pathname)) {
            await this.locks.get(pathname);
        }
        let resolve;
        const lock = new Promise((r) => {
            resolve = r;
        });
        this.locks.set(pathname, lock);
        try {
            return await fn();
        }
        finally {
            this.locks.delete(pathname);
            resolve();
        }
    }
    async get(pathname, _options) {
        const blob = this.blobs.get(pathname);
        if (!blob) {
            return null;
        }
        const content = blob.content;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(content));
                controller.close();
            },
        });
        return {
            stream,
            blob: {
                url: `fake://${pathname}`,
                downloadUrl: `fake://${pathname}?download=1`,
                pathname,
                contentType: blob.contentType,
                contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
                cacheControl: "public, max-age=31536000, immutable",
                size: blob.size,
                uploadedAt: blob.uploadedAt,
                etag: blob.etag,
            },
            headers: new Headers({
                "content-type": blob.contentType,
                "content-length": String(blob.size),
                etag: blob.etag,
            }),
        };
    }
    async put(pathname, body, options) {
        // Buffer the body outside the lock to avoid holding the lock
        // during potentially slow stream reads, matching real blob store
        // behavior where the server handles serialization.
        const content = await toBuffer(body);
        return this.withLock(pathname, () => {
            const existingBlob = this.blobs.get(pathname);
            // Check allowOverwrite option (default: true based on @vercel/blob behavior)
            const allowOverwrite = options.allowOverwrite ?? true;
            if (!allowOverwrite && existingBlob) {
                throw new BlobPreconditionFailedError();
            }
            // Check ifMatch (optimistic locking)
            if (options.ifMatch !== undefined) {
                if (!existingBlob) {
                    // Real @vercel/blob throws "The specified key does not exist"
                    throw new BlobPreconditionFailedError();
                }
                if (existingBlob.etag !== options.ifMatch) {
                    throw new BlobPreconditionFailedError();
                }
            }
            const etag = generateEtag();
            this.blobs.set(pathname, {
                pathname,
                content,
                contentType: options.contentType ?? "application/octet-stream",
                uploadedAt: new Date(),
                size: content.length,
                etag,
            });
            return {
                url: `fake://${pathname}`,
                downloadUrl: `fake://${pathname}?download=1`,
                pathname,
                contentType: options.contentType ?? "application/octet-stream",
                contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
                etag,
            };
        });
    }
    async del(urlOrPathname) {
        const paths = Array.isArray(urlOrPathname)
            ? urlOrPathname
            : [urlOrPathname];
        for (const p of paths) {
            // Handle both URLs and pathnames
            const pathname = p.startsWith("fake://") ? p.slice(7) : p;
            this.blobs.delete(pathname);
        }
    }
    async list(options) {
        let entries = [...this.blobs.values()];
        // Filter by prefix
        if (options?.prefix) {
            entries = entries.filter((b) => b.pathname.startsWith(options.prefix));
        }
        // Sort by pathname for consistent ordering
        entries.sort((a, b) => a.pathname.localeCompare(b.pathname));
        // Handle pagination
        const limit = options?.limit ?? 1000;
        const cursorIndex = options?.cursor
            ? Number.parseInt(options.cursor, 10)
            : 0;
        const slice = entries.slice(cursorIndex, cursorIndex + limit);
        const hasMore = cursorIndex + limit < entries.length;
        return {
            blobs: slice.map((b) => ({
                url: `fake://${b.pathname}`,
                downloadUrl: `fake://${b.pathname}?download=1`,
                pathname: b.pathname,
                size: b.size,
                uploadedAt: b.uploadedAt,
                etag: b.etag,
            })),
            hasMore,
            cursor: hasMore ? String(cursorIndex + limit) : undefined,
        };
    }
    // Test helpers
    clear() {
        this.blobs.clear();
    }
    has(pathname) {
        return this.blobs.has(pathname);
    }
    getContent(pathname) {
        return this.blobs.get(pathname)?.content;
    }
    getAll() {
        return new Map(this.blobs);
    }
}
//# sourceMappingURL=fake-blob-store.js.map