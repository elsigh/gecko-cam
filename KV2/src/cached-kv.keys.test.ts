import {
  type PrefixString,
  createTestKV,
  it,
  setupTestContext,
  uniqueTestPrefix,
} from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";

describe("KV2 keys", () => {
  setupTestContext();

  it("returns all keys", async (ctx) => {
    const { kv } = ctx;
    await kv.set("a", "1", { createdBy: "test", version: 1 });
    await kv.set("b", "2", { createdBy: "test", version: 1 });
    await kv.set("c", "3", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of kv.keys()) {
      keys.push(key);
    }

    expect(keys.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns keys matching prefix", async (ctx) => {
    const { kv } = ctx;
    await kv.set("users/1", "a", { createdBy: "test", version: 1 });
    await kv.set("users/2", "b", { createdBy: "test", version: 1 });
    await kv.set("posts/1", "c", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of kv.keys("users/")) {
      keys.push(key);
    }

    expect(keys.sort()).toEqual(["users/1", "users/2"]);
  });

  it("returns empty iterator for no matches", async (ctx) => {
    const { kv } = ctx;
    await kv.set("foo", "bar", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of kv.keys("nonexistent/")) {
      keys.push(key);
    }

    expect(keys).toEqual([]);
  });

  it("returns empty iterator for empty store", async (ctx) => {
    const { kv } = ctx;

    const keys: string[] = [];
    for await (const key of kv.keys()) {
      keys.push(key);
    }

    expect(keys).toEqual([]);
  });

  it("handles nested prefixes", async (ctx) => {
    const { kv } = ctx;
    await kv.set("a/b/c/1", "1", { createdBy: "test", version: 1 });
    await kv.set("a/b/c/2", "2", { createdBy: "test", version: 1 });
    await kv.set("a/b/d/1", "3", { createdBy: "test", version: 1 });
    await kv.set("a/x/1", "4", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of kv.keys("a/b/c/")) {
      keys.push(key);
    }

    expect(keys.sort()).toEqual(["a/b/c/1", "a/b/c/2"]);
  });

  it("does not match partial key names", async (ctx) => {
    const { kv } = ctx;
    await kv.set("users", "1", { createdBy: "test", version: 1 });
    await kv.set("users-admin", "2", { createdBy: "test", version: 1 });
    await kv.set("users/1", "3", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of kv.keys("users/")) {
      keys.push(key);
    }

    // Should only match "users/1", not "users" or "users-admin"
    expect(keys).toEqual(["users/1"]);
  });
});

describe("KV2 prefix option", () => {
  it("prepends global prefix to all keys", async () => {
    const customPrefix = `${uniqueTestPrefix()}myapp/` as PrefixString;
    const { kv: prefixedKv, cleanup: prefixCleanup } = createTestKV({
      prefix: customPrefix,
    });

    await prefixedKv.set("key", "value", { createdBy: "test", version: 1 });

    const result = await prefixedKv.get<string>("key");
    expect(result.exists).toBe(true);
    if (result.exists) {
      expect(await result.value).toBe("value");
    }

    await prefixCleanup();
  });

  it("strips prefix from list results", async () => {
    const customPrefix = `${uniqueTestPrefix()}myapp/` as PrefixString;
    const { kv: prefixedKv, cleanup: prefixCleanup } = createTestKV({
      prefix: customPrefix,
    });

    await prefixedKv.set("a", "1", { createdBy: "test", version: 1 });
    await prefixedKv.set("b", "2", { createdBy: "test", version: 1 });

    const keys: string[] = [];
    for await (const key of prefixedKv.keys()) {
      keys.push(key);
    }

    expect(keys.sort()).toEqual(["a", "b"]);

    await prefixCleanup();
  });

  it("isolates keys between different prefixes", async () => {
    const prefix1 = `${uniqueTestPrefix()}app1/` as PrefixString;
    const prefix2 = `${uniqueTestPrefix()}app2/` as PrefixString;

    const { kv: kv1, cleanup: cleanup1 } = createTestKV({ prefix: prefix1 });
    const { kv: kv2, cleanup: cleanup2 } = createTestKV({ prefix: prefix2 });

    await kv1.set("shared-key", "value1", { createdBy: "test", version: 1 });
    await kv2.set("shared-key", "value2", { createdBy: "test", version: 1 });

    const result1 = await kv1.get<string>("shared-key");
    const result2 = await kv2.get<string>("shared-key");

    expect(result1.exists).toBe(true);
    expect(result2.exists).toBe(true);
    if (result1.exists && result2.exists) {
      expect(await result1.value).toBe("value1");
      expect(await result2.value).toBe("value2");
    }

    await cleanup1();
    await cleanup2();
  });
});

describe("KV2 delete during iteration", () => {
  setupTestContext();

  it("deleting already-yielded keys during iteration is safe", async (ctx) => {
    const { kv } = ctx;
    for (let i = 0; i < 10; i++) {
      await kv.set(`key-${i.toString().padStart(2, "0")}`, `value-${i}`, {
        createdBy: "test",
        version: 1,
      });
    }

    // Delete every key as we iterate
    const deleted: string[] = [];
    for await (const key of kv.keys()) {
      await kv.delete(key);
      deleted.push(key);
    }

    // All keys were visited and deleted
    expect(deleted.length).toBe(10);

    // Store is now empty
    const remaining: string[] = [];
    for await (const key of kv.keys()) {
      remaining.push(key);
    }
    expect(remaining).toEqual([]);
  });

  it("conditionally deleting during iteration works", async (ctx) => {
    const { kv } = ctx;
    await kv.set("keep-a", "1", { createdBy: "test", version: 1 });
    await kv.set("delete-b", "2", { createdBy: "test", version: 1 });
    await kv.set("keep-c", "3", { createdBy: "test", version: 1 });
    await kv.set("delete-d", "4", { createdBy: "test", version: 1 });

    for await (const key of kv.keys()) {
      if (key.startsWith("delete-")) {
        await kv.delete(key);
      }
    }

    const remaining: string[] = [];
    for await (const key of kv.keys()) {
      remaining.push(key);
    }
    expect(remaining.sort()).toEqual(["keep-a", "keep-c"]);
  });

  it("deleting during entries iteration is safe", async (ctx) => {
    const { kv } = ctx;
    await kv.set("a", "1", { createdBy: "test", version: 1 });
    await kv.set("b", "2", { createdBy: "test", version: 1 });
    await kv.set("c", "3", { createdBy: "test", version: 1 });

    const visited: string[] = [];
    for await (const [key] of kv.entries()) {
      visited.push(key);
      await kv.delete(key);
    }

    expect(visited.length).toBe(3);

    const remaining: string[] = [];
    for await (const key of kv.keys()) {
      remaining.push(key);
    }
    expect(remaining).toEqual([]);
  });
});

describe("KV2 keys pagination", () => {
  setupTestContext();

  it("page returns first page of keys", async (ctx) => {
    const { kv } = ctx;
    await kv.set("a", "1", { createdBy: "test", version: 1 });
    await kv.set("b", "2", { createdBy: "test", version: 1 });
    await kv.set("c", "3", { createdBy: "test", version: 1 });

    const { keys, cursor } = await kv.keys().page(2);

    expect(keys.length).toBe(2);
    // May or may not have cursor depending on implementation
  });

  it("page returns all keys when limit exceeds count", async (ctx) => {
    const { kv } = ctx;
    await kv.set("a", "1", { createdBy: "test", version: 1 });
    await kv.set("b", "2", { createdBy: "test", version: 1 });

    const { keys, cursor } = await kv.keys().page(10);

    expect(keys.sort()).toEqual(["a", "b"]);
    expect(cursor).toBeUndefined();
  });

  it("page with prefix filters keys", async (ctx) => {
    const { kv } = ctx;
    await kv.set("users/1", "a", { createdBy: "test", version: 1 });
    await kv.set("users/2", "b", { createdBy: "test", version: 1 });
    await kv.set("posts/1", "c", { createdBy: "test", version: 1 });

    const { keys } = await kv.keys("users/").page(10);

    expect(keys.sort()).toEqual(["users/1", "users/2"]);
  });

  it("page returns empty for no matches", async (ctx) => {
    const { kv } = ctx;
    await kv.set("foo", "bar", { createdBy: "test", version: 1 });

    const { keys, cursor } = await kv.keys("nonexistent/").page(10);

    expect(keys).toEqual([]);
    expect(cursor).toBeUndefined();
  });

  it("page paginates through all keys with cursor", async (ctx) => {
    const { kv } = ctx;
    // Create enough keys to require multiple pages
    for (let i = 0; i < 10; i++) {
      await kv.set(`key-${i.toString().padStart(2, "0")}`, `value-${i}`, {
        createdBy: "test",
        version: i,
      });
    }

    const allKeys: string[] = [];
    let cursor: string | undefined;

    // Fetch in pages of 3
    do {
      const result = await kv.keys().page(3, cursor);
      allKeys.push(...result.keys);
      cursor = result.cursor;
    } while (cursor);

    // Should have all 10 keys
    expect(allKeys.length).toBe(10);
    expect(allKeys.sort()).toEqual([
      "key-00",
      "key-01",
      "key-02",
      "key-03",
      "key-04",
      "key-05",
      "key-06",
      "key-07",
      "key-08",
      "key-09",
    ]);
  });
});
