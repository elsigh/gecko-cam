import type {
  GetBlobResult,
  GetCommandOptions,
  ListBlobResult,
  ListCommandOptions,
  PutBlobResult,
  PutCommandOptions,
} from "@vercel/blob";
import { KV2 } from "../cached-kv.js";
import { uniqueTestPrefix } from "../testing/index.js";
import { describe, expect } from "../testing/vitest-compat.js";
import {
  type TestContext as BaseTestContext,
  afterEach as baseAfterEach,
  beforeEach as baseBeforeEach,
  it as baseIt,
} from "../testing/vitest-compat.js";
import type { BlobStore, PrefixString, PutBody } from "../types.js";

interface TestMetadata {
  createdBy: string;
  version: number;
}

/**
 * A blob store that allows direct content injection for testing malformed data
 */
class InjectableBlobStore implements BlobStore {
  private blobs = new Map<string, Buffer>();

  async get(
    pathname: string,
    _options: GetCommandOptions,
  ): Promise<GetBlobResult | null> {
    const content = this.blobs.get(pathname);
    if (!content) return null;

    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(content));
          controller.close();
        },
      }),
      blob: {
        url: `fake://${pathname}`,
        downloadUrl: `fake://${pathname}?download=1`,
        pathname,
        contentType: "application/octet-stream",
        contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
        cacheControl: "public, max-age=31536000, immutable",
        size: content.length,
        uploadedAt: new Date(),
        etag: `"fake-etag-${Date.now()}"`,
      },
      headers: new Headers({
        "content-type": "application/octet-stream",
        "content-length": String(content.length),
      }),
    };
  }

  async put(
    pathname: string,
    body: PutBody,
    _options: PutCommandOptions,
  ): Promise<PutBlobResult> {
    let content: Buffer;
    if (body instanceof Buffer) {
      content = body;
    } else if (body instanceof ReadableStream) {
      const chunks: Uint8Array[] = [];
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      content = Buffer.concat(chunks);
    } else if (typeof body === "string") {
      content = Buffer.from(body);
    } else {
      throw new Error("Unsupported body type in test");
    }

    this.blobs.set(pathname, content);
    return {
      url: `fake://${pathname}`,
      downloadUrl: `fake://${pathname}`,
      pathname,
      contentType: "application/octet-stream",
      contentDisposition: "",
      etag: `"fake-etag-${Date.now()}"`,
    };
  }

  async del(urlOrPathname: string | string[]): Promise<void> {
    const paths = Array.isArray(urlOrPathname)
      ? urlOrPathname
      : [urlOrPathname];
    for (const p of paths) {
      this.blobs.delete(p.replace("fake://", ""));
    }
  }

  async list(_options?: ListCommandOptions): Promise<ListBlobResult> {
    return {
      blobs: [...this.blobs.keys()].map((pathname) => ({
        url: `fake://${pathname}`,
        downloadUrl: `fake://${pathname}`,
        pathname,
        size: this.blobs.get(pathname)?.length ?? 0,
        uploadedAt: new Date(),
        etag: `"fake-etag-${Date.now()}"`,
      })),
      hasMore: false,
    };
  }

  injectRaw(pathname: string, content: Buffer): void {
    this.blobs.set(pathname, content);
  }

  /** Construct the full path for a key (matching KV2's internal format) */
  keyPath(prefix: string, key: string): string {
    return `cached-kv/${prefix}${key}.value`;
  }

  getContent(pathname: string): Buffer | undefined {
    return this.blobs.get(pathname);
  }

  clear(): void {
    this.blobs.clear();
  }
}

/** Context for malformed data tests with InjectableBlobStore */
interface MalformedTestContext extends BaseTestContext {
  blobStore: InjectableBlobStore;
  kv: KV2<TestMetadata>;
  prefix: PrefixString;
}

type TypedTestFn = (ctx: MalformedTestContext) => Promise<void> | void;
type TypedHookFn = (ctx: MalformedTestContext) => Promise<void> | void;

const it = (name: string, fn: TypedTestFn): void => {
  baseIt(name, fn as (ctx: BaseTestContext) => Promise<void> | void);
};

const beforeEach = (fn: TypedHookFn): void => {
  baseBeforeEach(fn as (ctx: BaseTestContext) => Promise<void> | void);
};

const afterEach = (fn: TypedHookFn): void => {
  baseAfterEach(fn as (ctx: BaseTestContext) => Promise<void> | void);
};

/**
 * Chaos tests for malformed data scenarios.
 * These tests inject corrupted/invalid data and verify the system handles it gracefully.
 */
describe("Chaos: Malformed Data", () => {
  beforeEach((ctx) => {
    ctx.prefix = uniqueTestPrefix();
    ctx.blobStore = new InjectableBlobStore();
    ctx.kv = new KV2<TestMetadata>({
      prefix: ctx.prefix,
      blobStore: ctx.blobStore,
    });
  });

  afterEach((ctx) => {
    ctx.blobStore.clear();
  });

  describe("header corruption", () => {
    it("should handle blob with invalid header length (too large)", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}corrupt-length.value`;
      const badBlob = Buffer.alloc(10);
      badBlob.writeUInt32BE(1000000, 0);

      blobStore.injectRaw(path, badBlob);

      await expect(kv.get("corrupt-length")).rejects.toThrow();
    });

    it("should handle blob with zero header length", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}zero-length.value`;
      const badBlob = Buffer.alloc(10);
      badBlob.writeUInt32BE(0, 0);

      blobStore.injectRaw(path, badBlob);

      await expect(kv.get("zero-length")).rejects.toThrow();
    });

    it("should handle blob that's too short to contain header length", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}too-short.value`;
      blobStore.injectRaw(path, Buffer.from([0x00, 0x00]));

      await expect(kv.get("too-short")).rejects.toThrow();
    });

    it("should handle empty blob", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}empty.value`;
      blobStore.injectRaw(path, Buffer.alloc(0));

      await expect(kv.get("empty")).rejects.toThrow();
    });

    it("should handle blob with only header length, no header", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}no-header.value`;
      const blob = Buffer.alloc(4);
      blob.writeUInt32BE(100, 0);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("no-header")).rejects.toThrow();
    });
  });

  describe("JSON corruption", () => {
    it("should handle invalid JSON in header", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bad-json.value`;
      const badJson = "{ not valid json }}}";
      const headerBuffer = Buffer.from(badJson);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("bad-json")).rejects.toThrow();
    });

    it("should handle truncated JSON in header", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}truncated-json.value`;
      const truncatedJson = '{"metadata": {"createdBy": "test"';
      const headerBuffer = Buffer.from(truncatedJson);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("truncated-json")).rejects.toThrow();
    });

    it("should handle JSON with wrong structure", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}wrong-structure.value`;
      const wrongJson = JSON.stringify({
        completely: "different",
        structure: true,
      });
      const headerBuffer = Buffer.from(wrongJson);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get("wrong-structure");
      expect(result.exists).toBe(true);
    });

    it("should handle header missing required fields", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}missing-fields.value`;
      const incompleteHeader = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        value: "test",
      });
      const headerBuffer = Buffer.from(incompleteHeader);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get("missing-fields");
      expect(result.exists).toBe(true);
    });

    it("should handle header with invalid encoding type", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bad-encoding.value`;
      const badHeader = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        value: "test",
        encoding: "invalid-encoding-type",
      });
      const headerBuffer = Buffer.from(badHeader);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<string>("bad-encoding");
      expect(result.exists).toBe(true);
    });
  });

  describe("payload corruption", () => {
    it("should handle raw-json with invalid JSON payload", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bad-payload-json.value`;
      const header = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        encoding: "raw-json",
      });
      const headerBuffer = Buffer.from(header);
      const invalidPayload = Buffer.from("{ not: valid json");

      const blob = Buffer.alloc(
        4 + headerBuffer.length + invalidPayload.length,
      );
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);
      invalidPayload.copy(blob, 4 + headerBuffer.length);

      blobStore.injectRaw(path, blob);

      const result = await kv.get("bad-payload-json");
      expect(result.exists).toBe(true);
      if (result.exists) {
        await expect(result.value).rejects.toThrow();
      }
    });

    it("should handle raw-binary with missing payload", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}missing-payload.value`;
      const header = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        encoding: "raw-binary",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<Buffer>("missing-payload");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.length).toBe(0);
      }
    });

    it("should handle base64 value with invalid base64 characters", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bad-base64.value`;
      const header = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        value: "!!!not-valid-base64!!!",
        encoding: "base64",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<Buffer>("bad-base64");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(Buffer.isBuffer(value)).toBe(true);
      }
    });
  });

  describe("encoding mismatches", () => {
    it("should handle json encoding with non-JSON value type", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}encoding-mismatch-json.value`;
      const header = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        value: "this is a string",
        encoding: "base64",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<Buffer>("encoding-mismatch-json");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(Buffer.isBuffer(value)).toBe(true);
      }
    });

    it("should handle raw-json with binary payload", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}raw-json-binary.value`;
      const header = JSON.stringify({
        metadata: { createdBy: "test", version: 1 },
        encoding: "raw-json",
      });
      const headerBuffer = Buffer.from(header);
      const binaryPayload = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

      const blob = Buffer.alloc(4 + headerBuffer.length + binaryPayload.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);
      binaryPayload.copy(blob, 4 + headerBuffer.length);

      blobStore.injectRaw(path, blob);

      const result = await kv.get("raw-json-binary");
      expect(result.exists).toBe(true);
      if (result.exists) {
        await expect(result.value).rejects.toThrow();
      }
    });
  });

  describe("metadata corruption", () => {
    it("should handle null metadata", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}null-meta.value`;
      const header = JSON.stringify({
        metadata: null,
        value: "test",
        encoding: "json",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<string>("null-meta");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toBeNull();
      }
    });

    it("should handle metadata as array instead of object", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}array-meta.value`;
      const header = JSON.stringify({
        metadata: [1, 2, 3],
        value: "test",
        encoding: "json",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<string>("array-meta");
      expect(result.exists).toBe(true);
      expect(Array.isArray(result.metadata)).toBe(true);
    });

    it("should handle metadata as primitive", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}primitive-meta.value`;
      const header = JSON.stringify({
        metadata: "just a string",
        value: "test",
        encoding: "json",
      });
      const headerBuffer = Buffer.from(header);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<string>("primitive-meta");
      expect(result.exists).toBe(true);
      expect(result.metadata as unknown).toBe("just a string");
    });
  });

  describe("size boundary attacks", () => {
    it("should handle header length at uint32 max boundary", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}max-uint32.value`;
      const blob = Buffer.alloc(8);
      blob.writeUInt32BE(0xffffffff, 0);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("max-uint32")).rejects.toThrow();
    });

    it("should handle negative header length (via signed interpretation)", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}negative-length.value`;
      const blob = Buffer.alloc(8);
      blob.writeUInt32BE(0x80000000, 0);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("negative-length")).rejects.toThrow();
    });
  });

  describe("unicode/encoding attacks", () => {
    it("should handle invalid UTF-8 sequences in header", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bad-utf8.value`;
      const invalidUtf8 = Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]);

      const blob = Buffer.alloc(4 + invalidUtf8.length);
      blob.writeUInt32BE(invalidUtf8.length, 0);
      invalidUtf8.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("bad-utf8")).rejects.toThrow();
    });

    it("should handle BOM in header", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}bom-header.value`;
      const bomJson = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(
          JSON.stringify({
            metadata: { createdBy: "test", version: 1 },
            value: "test",
            encoding: "json",
          }),
        ),
      ]);

      const blob = Buffer.alloc(4 + bomJson.length);
      blob.writeUInt32BE(bomJson.length, 0);
      bomJson.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      await expect(kv.get("bom-header")).rejects.toThrow();
    });

    it("should handle null bytes in JSON strings", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}null-bytes.value`;
      const jsonWithNull =
        '{"metadata":{"createdBy":"test\\u0000user","version":1},"value":"test","encoding":"json"}';
      const headerBuffer = Buffer.from(jsonWithNull);

      const blob = Buffer.alloc(4 + headerBuffer.length);
      blob.writeUInt32BE(headerBuffer.length, 0);
      headerBuffer.copy(blob, 4);

      blobStore.injectRaw(path, blob);

      const result = await kv.get<string>("null-bytes");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata.createdBy).toContain("\0");
      }
    });
  });

  describe("concurrency + corruption", () => {
    it("should handle corrupt data during concurrent reads", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}concurrent-corrupt.value`;

      blobStore.injectRaw(path, Buffer.from("not valid blob data"));

      const reads = Array.from({ length: 10 }, () =>
        kv.get("concurrent-corrupt").catch((e) => ({ error: e })),
      );

      const results = await Promise.all(reads);
      for (const r of results) {
        expect("error" in r).toBe(true);
      }
    });
  });

  describe("recovery scenarios", () => {
    it("should allow overwriting corrupt data with valid data", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}recover.value`;
      blobStore.injectRaw(path, Buffer.from("garbage"));

      await expect(kv.get("recover")).rejects.toThrow();

      await kv.set("recover", "fixed", { createdBy: "fixer", version: 1 });

      const result = await kv.get<string>("recover");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("fixed");
      }
    });

    it("should allow deleting corrupt data", async (ctx) => {
      const { kv, blobStore, prefix } = ctx;
      const path = `cached-kv/${prefix}delete-corrupt.value`;
      blobStore.injectRaw(path, Buffer.from("garbage"));

      await kv.delete("delete-corrupt");

      const result = await kv.get("delete-corrupt");
      expect(result.exists).toBe(false);
    });
  });
});
