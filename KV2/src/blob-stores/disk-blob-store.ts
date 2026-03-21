import * as fs from "node:fs/promises";
import * as path from "node:path";
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

interface DiskMeta {
  etag: string;
  contentType: string;
  uploadedAt: string;
  size: number;
}

let etagCounter = 0;
function generateEtag(): string {
  return `"disk-etag-${++etagCounter}-${Date.now()}"`;
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

export class DiskBlobStore implements BlobStore {
  private rootDir: string;
  private locks = new Map<string, Promise<void>>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private filePath(pathname: string): string {
    return path.join(this.rootDir, pathname);
  }

  private metaPath(pathname: string): string {
    return `${path.join(this.rootDir, pathname)}.meta`;
  }

  private async withLock<T>(
    pathname: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
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

  private async readMeta(pathname: string): Promise<DiskMeta | null> {
    try {
      const raw = await fs.readFile(this.metaPath(pathname), "utf-8");
      return JSON.parse(raw) as DiskMeta;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async get(
    pathname: string,
    _options: GetCommandOptions,
  ): Promise<GetBlobResult | null> {
    const meta = await this.readMeta(pathname);
    if (!meta) return null;

    let content: Buffer;
    try {
      content = await fs.readFile(this.filePath(pathname));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(content));
        controller.close();
      },
    });

    return {
      stream,
      blob: {
        url: `disk://${pathname}`,
        downloadUrl: `disk://${pathname}?download=1`,
        pathname,
        contentType: meta.contentType,
        contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
        cacheControl: "public, max-age=31536000, immutable",
        size: meta.size,
        uploadedAt: new Date(meta.uploadedAt),
        etag: meta.etag,
      },
      headers: new Headers({
        "content-type": meta.contentType,
        "content-length": String(meta.size),
        etag: meta.etag,
      }),
    };
  }

  async put(
    pathname: string,
    body: PutBody,
    options: PutCommandOptions,
  ): Promise<PutBlobResult> {
    const content = await toBuffer(body);

    return this.withLock(pathname, async () => {
      const existingMeta = await this.readMeta(pathname);

      const allowOverwrite = options.allowOverwrite ?? true;
      if (!allowOverwrite && existingMeta) {
        throw new BlobPreconditionFailedError();
      }

      if (options.ifMatch !== undefined) {
        if (!existingMeta) {
          throw new BlobPreconditionFailedError();
        }
        if (existingMeta.etag !== options.ifMatch) {
          throw new BlobPreconditionFailedError();
        }
      }

      const etag = generateEtag();
      const contentType = options.contentType ?? "application/octet-stream";
      const meta: DiskMeta = {
        etag,
        contentType,
        uploadedAt: new Date().toISOString(),
        size: content.length,
      };

      const fp = this.filePath(pathname);
      await fs.mkdir(path.dirname(fp), { recursive: true });
      await fs.writeFile(fp, content);
      await fs.writeFile(this.metaPath(pathname), JSON.stringify(meta));

      return {
        url: `disk://${pathname}`,
        downloadUrl: `disk://${pathname}?download=1`,
        pathname,
        contentType,
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
      const pathname = p.startsWith("disk://") ? p.slice(7) : p;
      try {
        await fs.unlink(this.filePath(pathname));
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      try {
        await fs.unlink(this.metaPath(pathname));
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }

  async list(options?: ListCommandOptions): Promise<ListBlobResult> {
    // Scope the walk to the deepest directory implied by the prefix
    // e.g. prefix "users/posts/" walks <rootDir>/users/posts/ instead of <rootDir>/
    const prefix = options?.prefix ?? "";
    const prefixDir = prefix.includes("/")
      ? prefix.slice(0, prefix.lastIndexOf("/") + 1)
      : "";
    const walkRoot = prefixDir
      ? path.join(this.rootDir, prefixDir)
      : this.rootDir;

    const allFiles = await this.walkDir(walkRoot);

    // Filter to content files (skip .meta), compute relative pathnames
    const entries: { pathname: string; meta: DiskMeta }[] = [];
    for (const absPath of allFiles) {
      if (absPath.endsWith(".meta")) continue;
      const pathname = path.relative(this.rootDir, absPath);
      if (prefix && !pathname.startsWith(prefix)) continue;
      const meta = await this.readMeta(pathname);
      if (meta) entries.push({ pathname, meta });
    }

    entries.sort((a, b) => a.pathname.localeCompare(b.pathname));

    const limit = options?.limit ?? 1000;
    const cursorIndex = options?.cursor
      ? Number.parseInt(options.cursor, 10)
      : 0;
    const slice = entries.slice(cursorIndex, cursorIndex + limit);
    const hasMore = cursorIndex + limit < entries.length;

    return {
      blobs: slice.map((e) => ({
        url: `disk://${e.pathname}`,
        downloadUrl: `disk://${e.pathname}?download=1`,
        pathname: e.pathname,
        size: e.meta.size,
        uploadedAt: new Date(e.meta.uploadedAt),
        etag: e.meta.etag,
      })),
      hasMore,
      cursor: hasMore ? String(cursorIndex + limit) : undefined,
    };
  }

  private async walkDir(dir: string, concurrency = 16): Promise<string[]> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }

    const results: string[] = [];
    // Process entries in batches to limit open file descriptors
    for (let i = 0; i < names.length; i += concurrency) {
      const batch = names.slice(i, i + concurrency);
      const settled = await Promise.all(
        batch.map(async (name) => {
          const full = path.join(dir, name);
          const stat = await fs.stat(full);
          if (stat.isDirectory()) {
            return this.walkDir(full, concurrency);
          }
          return [full];
        }),
      );
      for (const files of settled) {
        results.push(...files);
      }
    }
    return results;
  }

  // Test helpers
  async clear(): Promise<void> {
    await fs.rm(this.rootDir, { recursive: true, force: true });
  }

  async has(pathname: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(pathname));
      return true;
    } catch {
      return false;
    }
  }

  async getContent(pathname: string): Promise<Buffer | undefined> {
    try {
      return await fs.readFile(this.filePath(pathname));
    } catch {
      return undefined;
    }
  }
}
