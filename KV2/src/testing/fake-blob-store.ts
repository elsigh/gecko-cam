import {
  BlobPreconditionFailedError,
  type GetBlobResult,
  type GetCommandOptions,
  type ListBlobResult,
  type ListCommandOptions,
  type PutBlobResult,
  type PutCommandOptions,
} from "@vercel/blob";
import type { BlobStore, PutBody } from "../types.js";

interface StoredBlob {
  pathname: string;
  content: Buffer;
  contentType: string;
  uploadedAt: Date;
  size: number;
  etag: string;
}

let etagCounter = 0;
function generateEtag(): string {
  return `"fake-etag-${++etagCounter}-${Date.now()}"`;
}

async function toBuffer(body: PutBody): Promise<Buffer> {
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
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported body type");
}

export class FakeBlobStore implements BlobStore {
  private blobs = new Map<string, StoredBlob>();
  private locks = new Map<string, Promise<void>>();

  /**
   * Serialize writes to the same key to prevent race conditions
   * where concurrent callers all pass precondition checks before
   * any write lands.
   */
  private async withLock<T>(
    pathname: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    // Wait for any in-flight write to this key
    while (this.locks.has(pathname)) {
      await this.locks.get(pathname);
    }

    let resolve!: () => void;
    const lock = new Promise<void>((r) => {
      resolve = r;
    });
    this.locks.set(pathname, lock);

    try {
      return await fn();
    } finally {
      this.locks.delete(pathname);
      resolve();
    }
  }

  async get(
    pathname: string,
    _options: GetCommandOptions,
  ): Promise<GetBlobResult | null> {
    const blob = this.blobs.get(pathname);
    if (!blob) {
      return null;
    }

    const content = blob.content;
    const stream = new ReadableStream<Uint8Array>({
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

  async put(
    pathname: string,
    body: PutBody,
    options: PutCommandOptions,
  ): Promise<PutBlobResult> {
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

  async del(urlOrPathname: string | string[]): Promise<void> {
    const paths = Array.isArray(urlOrPathname)
      ? urlOrPathname
      : [urlOrPathname];
    for (const p of paths) {
      // Handle both URLs and pathnames
      const pathname = p.startsWith("fake://") ? p.slice(7) : p;
      this.blobs.delete(pathname);
    }
  }

  async list(options?: ListCommandOptions): Promise<ListBlobResult> {
    let entries = [...this.blobs.values()];

    // Filter by prefix
    if (options?.prefix) {
      entries = entries.filter((b) =>
        b.pathname.startsWith(options.prefix as string),
      );
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
  clear(): void {
    this.blobs.clear();
  }

  has(pathname: string): boolean {
    return this.blobs.has(pathname);
  }

  getContent(pathname: string): Buffer | undefined {
    return this.blobs.get(pathname)?.content;
  }

  getAll(): Map<string, StoredBlob> {
    return new Map(this.blobs);
  }
}
