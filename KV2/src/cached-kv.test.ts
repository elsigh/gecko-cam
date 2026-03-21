import { KV2 } from "./cached-kv.js";
import { FakeBlobStore } from "./testing/fake-blob-store.js";
import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
import type { CacheLike } from "./types.js";

describe("KV2", () => {
  setupTestContext();

  describe("get", () => {
    it("returns exists: false for missing key", async (ctx) => {
      const { kv } = ctx;
      const result = await kv.get("nonexistent");
      expect(result.exists).toBe(false);
      expect(result.metadata).toBeUndefined();
      expect(result.value).toBeUndefined();
      expect(result.stream).toBeUndefined();
    });

    it("returns exists: true with value and metadata for existing key", async (ctx) => {
      const { kv } = ctx;
      await kv.set(
        "test-key",
        { foo: "bar" },
        { createdBy: "test", version: 1 },
      );

      const result = await kv.get<{ foo: string }>("test-key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toEqual({ createdBy: "test", version: 1 });
        expect(await result.value).toEqual({ foo: "bar" });
      }
    });

    it("returns cached value on second get", async (ctx) => {
      const { kv } = ctx;
      await kv.set("cached-key", "value", { createdBy: "test", version: 1 });

      // First get populates cache
      const result1 = await kv.get<string>("cached-key");
      expect(result1.exists).toBe(true);
      if (result1.exists) {
        expect(await result1.value).toBe("value");
      }

      // Second get should return same result (from cache)
      const result2 = await kv.get<string>("cached-key");
      expect(result2.exists).toBe(true);
      if (result2.exists) {
        expect(await result2.value).toBe("value");
      }
    });

    it("provides stream access to raw bytes", async (ctx) => {
      const { kv } = ctx;
      await kv.set(
        "stream-test",
        { data: "test" },
        { createdBy: "test", version: 1 },
      );

      const result = await kv.get("stream-test");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const stream = await result.stream;
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const bytes = Buffer.concat(chunks);
        expect(JSON.parse(bytes.toString("utf-8"))).toEqual({ data: "test" });
      }
    });
  });

  describe("put", () => {
    it("stores value and metadata", async (ctx) => {
      const { kv } = ctx;
      await kv.set("my-key", "hello world", { createdBy: "user", version: 1 });

      const result = await kv.get<string>("my-key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("hello world");
        expect(result.metadata.createdBy).toBe("user");
      }
    });

    it("overwrites existing key", async (ctx) => {
      const { kv } = ctx;
      await kv.set("key", "value1", { createdBy: "a", version: 1 });
      await kv.set("key", "value2", { createdBy: "b", version: 2 });

      const result = await kv.get<string>("key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("value2");
        expect(result.metadata.version).toBe(2);
      }
    });

    it("stores objects as JSON", async (ctx) => {
      const { kv } = ctx;
      const obj = { nested: { data: [1, 2, 3] } };
      await kv.set("obj-key", obj, { createdBy: "test", version: 1 });

      const result = await kv.get<typeof obj>("obj-key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toEqual(obj);
      }
    });

    it("stores number values", async (ctx) => {
      const { kv } = ctx;
      await kv.set("number", 42, { createdBy: "test", version: 1 });

      const result = await kv.get<number>("number");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe(42);
      }
    });

    it("stores boolean values", async (ctx) => {
      const { kv } = ctx;
      await kv.set("bool-true", true, { createdBy: "test", version: 1 });
      await kv.set("bool-false", false, { createdBy: "test", version: 1 });

      const resultTrue = await kv.get<boolean>("bool-true");
      const resultFalse = await kv.get<boolean>("bool-false");

      expect(resultTrue.exists).toBe(true);
      expect(resultFalse.exists).toBe(true);
      if (resultTrue.exists && resultFalse.exists) {
        expect(await resultTrue.value).toBe(true);
        expect(await resultFalse.value).toBe(false);
      }
    });

    it("rejects undefined values", async (ctx) => {
      const { kv } = ctx;
      let threw = false;
      try {
        // biome-ignore lint/suspicious/noExplicitAny: testing that undefined is rejected at runtime
        await kv.set("bad", undefined as any, {
          createdBy: "test",
          version: 1,
        });
      } catch (e: unknown) {
        threw = true;
        expect((e as Error).message).toContain("undefined");
      }
      expect(threw).toBe(true);
    });

    it("stores null values", async (ctx) => {
      const { kv } = ctx;
      await kv.set("null-value", null, { createdBy: "test", version: 1 });

      const result = await kv.get<null>("null-value");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBeNull();
      }
    });

    it("stores array values", async (ctx) => {
      const { kv } = ctx;
      const arr = [1, "two", { three: 3 }];
      await kv.set("array", arr, { createdBy: "test", version: 1 });

      const result = await kv.get<typeof arr>("array");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toEqual(arr);
      }
    });

    it("invalidates cache on put", async (ctx) => {
      const { kv } = ctx;
      await kv.set("cache-test", "old", { createdBy: "test", version: 1 });

      // Populate cache
      const first = await kv.get<string>("cache-test");
      if (first.exists) await first.value;

      // Update value
      await kv.set("cache-test", "new", { createdBy: "test", version: 2 });

      // Should get new value, not cached old value
      const result = await kv.get<string>("cache-test");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("new");
      }
    });
  });

  describe("validatePrefix", () => {
    it("throws when prefix ends with .value", async () => {
      const { KV2 } = await import("./cached-kv.js");
      const { FakeBlobStore } = await import("./testing/fake-blob-store.js");
      let threw = false;
      try {
        new KV2({
          prefix: "bad.value" as `${string}/`,
          blobStore: new FakeBlobStore(),
        });
      } catch (e: unknown) {
        threw = true;
        expect((e as Error).message).toContain(".value");
      }
      expect(threw).toBe(true);
    });
  });

  describe("Uint8Array roundtrip", () => {
    it("stores and retrieves Uint8Array values", async (ctx) => {
      const { kv } = ctx;
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await kv.set("binary", data, { createdBy: "test", version: 1 });

      const result = await kv.get<Buffer>("binary");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const val = await result.value;
        expect(Buffer.isBuffer(val)).toBe(true);
        expect(val[0]).toBe(1);
        expect(val[4]).toBe(5);
      }
    });
  });

  describe("getMany", () => {
    it("returns entries for existing keys", async (ctx) => {
      const { kv } = ctx;
      await kv.set("gm-a", "val-a", { createdBy: "test", version: 1 });
      await kv.set("gm-b", "val-b", { createdBy: "test", version: 1 });

      const results = await kv.getMany<string>(["gm-a", "gm-b", "gm-missing"]);

      expect(results.size).toBe(2);
      expect(results.has("gm-a")).toBe(true);
      expect(results.has("gm-b")).toBe(true);
      expect(results.has("gm-missing")).toBe(false);
    });
  });

  describe("entries().page()", () => {
    it("returns paginated entries", async (ctx) => {
      const { kv } = ctx;
      for (let i = 0; i < 5; i++) {
        await kv.set(`ep-${i}`, `val-${i}`, { createdBy: "test", version: 1 });
      }

      const page1 = await kv.entries<string>().page(3);
      expect(page1.entries.length).toBe(3);
      expect(page1.cursor).toBeDefined();

      const page2 = await kv.entries<string>().page(3, page1.cursor);
      expect(page2.entries.length).toBe(2);
      expect(page2.cursor).toBeUndefined();
    });
  });

  describe("keys().page()", () => {
    it("returns paginated keys", async (ctx) => {
      const { kv } = ctx;
      for (let i = 0; i < 5; i++) {
        await kv.set(`kp-${i}`, `val-${i}`, { createdBy: "test", version: 1 });
      }

      const page1 = await kv.keys().page(3);
      expect(page1.keys.length).toBe(3);
      expect(page1.cursor).toBeDefined();

      const page2 = await kv.keys().page(3, page1.cursor);
      expect(page2.keys.length).toBe(2);
      expect(page2.cursor).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("removes key", async (ctx) => {
      const { kv } = ctx;
      await kv.set("to-delete", "value", { createdBy: "test", version: 1 });
      await kv.delete("to-delete");

      const result = await kv.get("to-delete");
      expect(result.exists).toBe(false);
    });

    it("does not throw on missing key", async (ctx) => {
      const { kv } = ctx;
      await expect(kv.delete("nonexistent")).resolves.toBeUndefined();
    });

    it("invalidates cache on delete", async (ctx) => {
      const { kv } = ctx;
      await kv.set("cache-delete", "value", { createdBy: "test", version: 1 });

      // Populate cache
      const first = await kv.get<string>("cache-delete");
      if (first.exists) await first.value;

      // Delete
      await kv.delete("cache-delete");

      // Should return not found
      const result = await kv.get("cache-delete");
      expect(result.exists).toBe(false);
    });
  });
});

describe("KV2 large values (streaming from blob)", () => {
  // No-op cache forces reads from blob store, exercising streaming paths
  const noopCache: CacheLike = {
    get: async () => null,
    set: async () => {},
    expireTag: async () => {},
  };

  function createLargeKV() {
    const blobStore = new FakeBlobStore();
    const kv = new KV2({
      prefix: "test/" as `${string}/`,
      blobStore,
      cache: noopCache,
      largeValueThreshold: 16,
    });
    return { kv, blobStore };
  }

  it("set and get large JSON (object > 16 bytes) — read .value", async () => {
    const { kv } = createLargeKV();
    const largeObj = { message: "this is a large JSON value" };
    await kv.set("large-json", largeObj);

    const result = await kv.get<typeof largeObj>("large-json");
    expect(result.exists).toBe(true);
    if (result.exists) {
      expect(await result.value).toEqual(largeObj);
    }
  });

  it("set and get large binary (Buffer > 16 bytes) — read .value", async () => {
    const { kv } = createLargeKV();
    const data = Buffer.alloc(32, 0xab);
    await kv.set("large-binary", data);

    const result = await kv.get<Buffer>("large-binary");
    expect(result.exists).toBe(true);
    if (result.exists) {
      const val = await result.value;
      expect(Buffer.isBuffer(val)).toBe(true);
      expect(val.length).toBe(32);
      expect(val[0]).toBe(0xab);
    }
  });

  it("large value: read .value then .stream uses buffered data", async () => {
    const { kv } = createLargeKV();
    const largeObj = { data: "exceeding threshold for stream" };
    await kv.set("stream-after-value", largeObj);

    const result = await kv.get<typeof largeObj>("stream-after-value");
    expect(result.exists).toBe(true);
    if (result.exists) {
      // Read value first (buffers payload)
      const val = await result.value;
      expect(val).toEqual(largeObj);

      // Then read stream (should use already-buffered data)
      const stream = await result.stream;
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      expect(JSON.parse(bytes.toString("utf-8"))).toEqual(largeObj);
    }
  });

  it("large value: consuming stream then reading value throws", async () => {
    const { kv } = createLargeKV();
    const largeObj = { data: "value for consumed stream test here" };
    await kv.set("consumed-stream", largeObj);

    const result = await kv.get("consumed-stream");
    expect(result.exists).toBe(true);
    if (result.exists) {
      // Consume stream first
      const stream = await result.stream;
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Reading value after stream consumed should throw
      let threw = false;
      try {
        await result.value;
      } catch (e) {
        threw = true;
        expect((e as Error).message).toContain("stream has been consumed");
      }
      expect(threw).toBe(true);
    }
  });

  it("set via ReadableStream input, then get", async () => {
    const { kv } = createLargeKV();
    const payload = Buffer.from("stream-input-payload-data-here!!");
    const inputStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });

    await kv.set("stream-input", inputStream);

    const result = await kv.get<Buffer>("stream-input");
    expect(result.exists).toBe(true);
    if (result.exists) {
      const val = await result.value;
      expect(Buffer.isBuffer(val)).toBe(true);
      expect(val.toString()).toBe("stream-input-payload-data-here!!");
    }
  });

  it("entry.update() on blob result (not from cache)", async () => {
    const { kv } = createLargeKV();
    // Use a small value to hit createResultFromBuffer path (pure JSON format)
    await kv.set("update-blob", "hi");

    const result = await kv.get<string>("update-blob");
    expect(result.exists).toBe(true);
    if (result.exists) {
      await result.update("updated");

      const updated = await kv.get<string>("update-blob");
      expect(updated.exists).toBe(true);
      if (updated.exists) {
        expect(await updated.value).toBe("updated");
      }
    }
  });
});
