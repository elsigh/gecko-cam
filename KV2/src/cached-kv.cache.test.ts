import { KV2 } from "./cached-kv.js";
import { FakeBlobStore } from "./testing/fake-blob-store.js";
import { FakeCache } from "./testing/fake-cache.js";
import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";

/**
 * Tests for cache consistency.
 * These tests would fail or be flaky if cache invalidation isn't working correctly.
 */
describe("KV2 cache consistency", () => {
  setupTestContext();

  describe("read-your-writes after put", () => {
    it("immediately sees new value after put (not stale cache)", async (ctx) => {
      const { kv } = ctx;

      // Initial put and get to populate cache
      await kv.set("key", "initial", { createdBy: "test", version: 1 });
      const first = await kv.get<string>("key");
      expect(first.exists).toBe(true);
      if (first.exists) {
        expect(await first.value).toBe("initial");
      }

      // Update immediately
      await kv.set("key", "updated", { createdBy: "test", version: 2 });

      // Should see updated value, not cached "initial"
      const second = await kv.get<string>("key");
      expect(second.exists).toBe(true);
      if (second.exists) {
        expect(await second.value).toBe("updated");
        expect(second.metadata.version).toBe(2);
      }
    });

    it("sees correct value after rapid sequential puts", async (ctx) => {
      const { kv } = ctx;

      // Rapid sequential updates
      await kv.set("rapid", "v1", { createdBy: "test", version: 1 });
      await kv.set("rapid", "v2", { createdBy: "test", version: 2 });
      await kv.set("rapid", "v3", { createdBy: "test", version: 3 });
      await kv.set("rapid", "v4", { createdBy: "test", version: 4 });
      await kv.set("rapid", "v5", { createdBy: "test", version: 5 });

      // Should see final value
      const result = await kv.get<string>("rapid");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("v5");
        expect(result.metadata.version).toBe(5);
      }
    });

    it("sees correct value after interleaved puts and gets", async (ctx) => {
      const { kv } = ctx;

      for (let i = 1; i <= 10; i++) {
        await kv.set("interleaved", `value-${i}`, {
          createdBy: "test",
          version: i,
        });

        const result = await kv.get<string>("interleaved");
        expect(result.exists).toBe(true);
        if (result.exists) {
          // Must see the value we just wrote, not a stale cached value
          expect(await result.value).toBe(`value-${i}`);
          expect(result.metadata.version).toBe(i);
        }
      }
    });

    it("metadata is consistent with value after update", async (ctx) => {
      const { kv } = ctx;

      await kv.set("meta-sync", "old", { createdBy: "alice", version: 1 });
      const first = await kv.get<string>("meta-sync");
      if (first.exists) await first.value; // Populate cache

      await kv.set("meta-sync", "new", { createdBy: "bob", version: 2 });

      const result = await kv.get<string>("meta-sync");
      expect(result.exists).toBe(true);
      if (result.exists) {
        // Value and metadata must be from same write, not mixed
        expect(await result.value).toBe("new");
        expect(result.metadata.createdBy).toBe("bob");
        expect(result.metadata.version).toBe(2);
      }
    });
  });

  describe("read-your-writes after delete", () => {
    it("immediately sees not found after delete (not stale cache)", async (ctx) => {
      const { kv } = ctx;

      // Create and read to populate cache
      await kv.set("to-delete", "exists", { createdBy: "test", version: 1 });
      const first = await kv.get<string>("to-delete");
      expect(first.exists).toBe(true);
      if (first.exists) {
        expect(await first.value).toBe("exists");
      }

      // Delete immediately
      await kv.delete("to-delete");

      // Should see not found, not cached value
      const second = await kv.get("to-delete");
      expect(second.exists).toBe(false);
    });

    it("sees not found after delete even with multiple prior reads", async (ctx) => {
      const { kv } = ctx;

      await kv.set("multi-read", "value", { createdBy: "test", version: 1 });

      // Multiple reads to really populate cache
      for (let i = 0; i < 5; i++) {
        const result = await kv.get<string>("multi-read");
        expect(result.exists).toBe(true);
        if (result.exists) {
          expect(await result.value).toBe("value");
        }
      }

      // Delete
      await kv.delete("multi-read");

      // Must see not found
      const result = await kv.get("multi-read");
      expect(result.exists).toBe(false);
    });

    it("can recreate key after delete", async (ctx) => {
      const { kv } = ctx;

      // Create, read, delete
      await kv.set("recreate", "first", { createdBy: "test", version: 1 });
      const first = await kv.get<string>("recreate");
      if (first.exists) await first.value;

      await kv.delete("recreate");
      const deleted = await kv.get("recreate");
      expect(deleted.exists).toBe(false);

      // Recreate with new value
      await kv.set("recreate", "second", { createdBy: "test", version: 2 });

      // Should see new value, not old cached value or not-found
      const result = await kv.get<string>("recreate");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("second");
        expect(result.metadata.version).toBe(2);
      }
    });
  });

  describe("cache isolation between keys", () => {
    it("updating one key does not affect another key's cached value", async (ctx) => {
      const { kv } = ctx;

      // Set up two keys
      await kv.set("key-a", "value-a", { createdBy: "test", version: 1 });
      await kv.set("key-b", "value-b", { createdBy: "test", version: 1 });

      // Read both to populate cache
      const a1 = await kv.get<string>("key-a");
      const b1 = await kv.get<string>("key-b");
      if (a1.exists) await a1.value;
      if (b1.exists) await b1.value;

      // Update only key-a
      await kv.set("key-a", "value-a-updated", {
        createdBy: "test",
        version: 2,
      });

      // key-a should be updated
      const a2 = await kv.get<string>("key-a");
      expect(a2.exists).toBe(true);
      if (a2.exists) {
        expect(await a2.value).toBe("value-a-updated");
      }

      // key-b should still have original value (from cache is fine)
      const b2 = await kv.get<string>("key-b");
      expect(b2.exists).toBe(true);
      if (b2.exists) {
        expect(await b2.value).toBe("value-b");
      }
    });

    it("deleting one key does not affect another key", async (ctx) => {
      const { kv } = ctx;

      await kv.set("keep", "kept", { createdBy: "test", version: 1 });
      await kv.set("remove", "removed", { createdBy: "test", version: 1 });

      // Populate cache
      const keep1 = await kv.get<string>("keep");
      const remove1 = await kv.get<string>("remove");
      if (keep1.exists) await keep1.value;
      if (remove1.exists) await remove1.value;

      // Delete one
      await kv.delete("remove");

      // Deleted key should be gone
      const remove2 = await kv.get("remove");
      expect(remove2.exists).toBe(false);

      // Other key should still exist
      const keep2 = await kv.get<string>("keep");
      expect(keep2.exists).toBe(true);
      if (keep2.exists) {
        expect(await keep2.value).toBe("kept");
      }
    });
  });

  describe("memory cache TTL", () => {
    it("expired entries return null", async () => {
      const { MemoryCache } = await import("./memory-cache.js");

      // Save and clear the global state to avoid singleton issues
      const origLog = console.log;
      console.log = () => {};

      try {
        const cache = new MemoryCache();

        // Set with very short TTL (0 seconds = immediate expiration)
        await cache.set("ttl-key", "value", { ttl: 0 });

        // Wait a tick for expiration
        await new Promise((resolve) => setTimeout(resolve, 10));

        const result = await cache.get("ttl-key");
        expect(result).toBeNull();
      } finally {
        console.log = origLog;
      }
    });
  });

  describe("stream consistency", () => {
    it("stream reflects current value after update", async (ctx) => {
      const { kv } = ctx;

      await kv.set(
        "stream-key",
        { version: 1 },
        { createdBy: "test", version: 1 },
      );
      const first = await kv.get("stream-key");
      if (first.exists) await first.value; // Populate cache

      await kv.set(
        "stream-key",
        { version: 2 },
        { createdBy: "test", version: 2 },
      );

      const result = await kv.get("stream-key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        // Stream should have updated data
        const stream = await result.stream;
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        expect(parsed.version).toBe(2);
      }
    });

    it("value and stream are consistent with each other", async (ctx) => {
      const { kv } = ctx;

      const data = { id: 123, name: "test" };
      await kv.set("consistent", data, { createdBy: "test", version: 1 });

      const result = await kv.get<typeof data>("consistent");
      expect(result.exists).toBe(true);
      if (result.exists) {
        // Get both value and stream
        const value = await result.value;
        const stream = await result.stream;

        // Read stream
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        const fromStream = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

        // Both should represent the same data
        expect(value).toEqual(fromStream);
      }
    });
  });
});

function createRangeTestKV() {
  const blobStore = new FakeBlobStore();
  const cache = new FakeCache();
  let listCallCount = 0;
  const origList = blobStore.list.bind(blobStore);
  blobStore.list = async (...args: Parameters<typeof blobStore.list>) => {
    listCallCount++;
    return origList(...args);
  };
  const prefix =
    `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/` as `${string}/`;
  const kv = new KV2<unknown>({ prefix, blobStore, cache });
  return {
    kv,
    blobStore,
    cache,
    prefix,
    getListCallCount: () => listCallCount,
  };
}

describe("KV2 range cache", () => {
  describe("keys().page() caching", () => {
    it("returns cached result on second call", async () => {
      const { kv, getListCallCount } = createRangeTestKV();

      await kv.set("a", 1);
      await kv.set("b", 2);

      // First call — hits blob store
      const page1 = await kv.keys().page(10);
      expect(page1.keys).toEqual(["a", "b"]);

      const listCallsBefore = getListCallCount();

      // Second call — should come from cache
      const page2 = await kv.keys().page(10);
      expect(page2.keys).toEqual(["a", "b"]);

      // No additional list calls (cache hit)
      expect(getListCallCount()).toBe(listCallsBefore);
    });

    it("cache is invalidated on set()", async () => {
      const { kv } = createRangeTestKV();

      await kv.set("a", 1);
      await kv.set("b", 2);

      // Populate range cache
      const page1 = await kv.keys().page(10);
      expect(page1.keys).toEqual(["a", "b"]);

      // Add a new key (no expectedVersion — possibly new key)
      await kv.set("c", 3);

      // Range cache should be invalidated — new result includes "c"
      const page2 = await kv.keys().page(10);
      expect(page2.keys).toEqual(["a", "b", "c"]);
    });

    it("cache is invalidated on delete()", async () => {
      const { kv } = createRangeTestKV();

      await kv.set("a", 1);
      await kv.set("b", 2);

      // Populate range cache
      const page1 = await kv.keys().page(10);
      expect(page1.keys).toEqual(["a", "b"]);

      // Delete a key
      await kv.delete("b");

      // Range cache should be invalidated — "b" is gone
      const page2 = await kv.keys().page(10);
      expect(page2.keys).toEqual(["a"]);
    });

    it("set() only invalidates range caches for matching prefixes", async () => {
      const { kv, getListCallCount } = createRangeTestKV();

      // Set up keys in two different prefixes
      await kv.set("users/alice", { name: "Alice" });
      await kv.set("posts/hello", { title: "Hello" });

      // Populate range caches for both prefixes
      const usersPage = await kv.keys("users/").page(10);
      expect(usersPage.keys).toEqual(["users/alice"]);

      const postsPage = await kv.keys("posts/").page(10);
      expect(postsPage.keys).toEqual(["posts/hello"]);

      const listCallsBefore = getListCallCount();

      // Add a new post — should only invalidate root + posts/ range caches
      await kv.set("posts/world", { title: "World" });

      // Users range cache should still be valid (no list call)
      const usersPage2 = await kv.keys("users/").page(10);
      expect(usersPage2.keys).toEqual(["users/alice"]);

      // No additional list calls for users/ prefix
      expect(getListCallCount()).toBe(listCallsBefore);

      // Posts range cache should be invalidated (new list call needed)
      const postsPage2 = await kv.keys("posts/").page(10);
      expect(postsPage2.keys).toEqual(["posts/hello", "posts/world"]);

      // One additional list call for posts/ prefix
      expect(getListCallCount()).toBe(listCallsBefore + 1);
    });

    it("set('foobar') invalidates keys('foo') but not keys('bar')", async () => {
      const { kv, getListCallCount } = createRangeTestKV();

      await kv.set("foobar", 1);

      // Populate range caches for "foo" and "bar" prefixes
      const fooPage = await kv.keys("foo").page(10);
      expect(fooPage.keys).toEqual(["foobar"]);

      const barPage = await kv.keys("bar").page(10);
      expect(barPage.keys).toEqual([]);

      const listCallsBefore = getListCallCount();

      // Mutate "foobar" — should invalidate keys("foo"), not keys("bar")
      await kv.set("foobar", 2);

      // keys("bar") should still be cached (no list call)
      const barPage2 = await kv.keys("bar").page(10);
      expect(barPage2.keys).toEqual([]);
      expect(getListCallCount()).toBe(listCallsBefore);

      // keys("foo") should be invalidated (new list call)
      const fooPage2 = await kv.keys("foo").page(10);
      expect(fooPage2.keys).toEqual(["foobar"]);
      expect(getListCallCount()).toBe(listCallsBefore + 1);
    });

    it("update with expectedVersion does not invalidate range caches", async () => {
      const { kv, getListCallCount } = createRangeTestKV();

      // Set up a key
      const { version } = await kv.set("users/alice", { name: "Alice" });

      // Populate range cache
      const page1 = await kv.keys("users/").page(10);
      expect(page1.keys).toEqual(["users/alice"]);

      const listCallsBefore = getListCallCount();

      // Update existing key with expectedVersion (known update, not a new key)
      await kv.set("users/alice", { name: "Alice Updated" }, undefined, {
        expectedVersion: version,
      });

      // Range cache should still be valid
      const page2 = await kv.keys("users/").page(10);
      expect(page2.keys).toEqual(["users/alice"]);

      // No additional list calls
      expect(getListCallCount()).toBe(listCallsBefore);
    });

    it("index range queries are invalidated when index entries change", async () => {
      const { kv } = createRangeTestKV();

      // Simulate index entries (TypedKV stores these as regular keys)
      await kv.set("__idx/users/byEmail/alice@test.com/alice", "alice");
      await kv.set("__idx/users/byEmail/bob@test.com/bob", "bob");

      // Populate range cache for the index prefix
      const page1 = await kv
        .keys("__idx/users/byEmail/alice@test.com/")
        .page(10);
      expect(page1.keys).toEqual(["__idx/users/byEmail/alice@test.com/alice"]);

      // Add a new index entry under the same email prefix
      await kv.set("__idx/users/byEmail/alice@test.com/alice2", "alice2");

      // The range cache for alice@test.com/ should be invalidated
      const page2 = await kv
        .keys("__idx/users/byEmail/alice@test.com/")
        .page(10);
      expect(page2.keys).toEqual([
        "__idx/users/byEmail/alice@test.com/alice",
        "__idx/users/byEmail/alice@test.com/alice2",
      ]);
    });
  });
});
