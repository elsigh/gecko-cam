import type { KV2 } from "./cached-kv.js";
import { it, setupTestContext } from "./testing/test-setup.js";
import type { KVTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
import type { TypedKV } from "./typed-kv.js";

interface User {
  name: string;
  email: string;
}

interface Post {
  title: string;
  content: string;
  authorId: string;
}

describe("TypedKV (getStore)", () => {
  setupTestContext();

  describe("basic operations", () => {
    it("creates typed sub-KV with prefix", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "123",
        { name: "Alice", email: "alice@example.com" },
        { createdBy: "admin", version: 1 },
      );

      const result = await users.get("123");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.name).toBe("Alice");
        expect(value.email).toBe("alice@example.com");
      }
    });

    it("get returns not found for missing key", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      const result = await users.get("nonexistent");
      expect(result.exists).toBe(false);
    });

    it("delete removes key", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "to-delete",
        { name: "Bob", email: "bob@example.com" },
        { createdBy: "admin", version: 1 },
      );

      await users.delete("to-delete");

      const result = await users.get("to-delete");
      expect(result.exists).toBe(false);
    });

    it("overwrites existing key", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "user1",
        { name: "Old Name", email: "old@example.com" },
        { createdBy: "admin", version: 1 },
      );

      await users.set(
        "user1",
        { name: "New Name", email: "new@example.com" },
        { createdBy: "admin", version: 2 },
      );

      const result = await users.get("user1");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.name).toBe("New Name");
        expect(result.metadata.version).toBe(2);
      }
    });
  });

  describe("list operations", () => {
    it("list returns keys without sub-prefix", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "1",
        { name: "A", email: "a@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "2",
        { name: "B", email: "b@test.com" },
        { createdBy: "test", version: 1 },
      );

      const keys: string[] = [];
      for await (const key of users.keys()) {
        keys.push(key);
      }

      expect(keys.sort()).toEqual(["1", "2"]);
    });

    it("list with prefix filters within sub-store", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "admin/1",
        { name: "Admin1", email: "admin1@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "admin/2",
        { name: "Admin2", email: "admin2@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "regular/1",
        { name: "Regular1", email: "regular@test.com" },
        { createdBy: "test", version: 1 },
      );

      const keys: string[] = [];
      for await (const key of users.keys("admin/")) {
        keys.push(key);
      }

      expect(keys.sort()).toEqual(["admin/1", "admin/2"]);
    });

    it("list returns empty for no matches", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "1",
        { name: "A", email: "a@test.com" },
        { createdBy: "test", version: 1 },
      );

      const keys: string[] = [];
      for await (const key of users.keys("nonexistent/")) {
        keys.push(key);
      }

      expect(keys).toEqual([]);
    });
  });

  describe("isolation", () => {
    it("different stores are isolated", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");
      const posts = kv.getStore<Post>("posts/");

      await users.set(
        "1",
        { name: "Alice", email: "alice@test.com" },
        { createdBy: "test", version: 1 },
      );
      await posts.set(
        "1",
        { title: "Hello", content: "World", authorId: "1" },
        { createdBy: "test", version: 1 },
      );

      const userKeys: string[] = [];
      for await (const key of users.keys()) {
        userKeys.push(key);
      }

      const postKeys: string[] = [];
      for await (const key of posts.keys()) {
        postKeys.push(key);
      }

      expect(userKeys).toEqual(["1"]);
      expect(postKeys).toEqual(["1"]);

      // Values are different types
      const user = await users.get("1");
      const post = await posts.get("1");

      expect(user.exists).toBe(true);
      expect(post.exists).toBe(true);
      if (user.exists && post.exists) {
        expect((await user.value).name).toBe("Alice");
        expect((await post.value).title).toBe("Hello");
      }
    });

    it("parent KV sees all keys with full paths", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");
      const posts = kv.getStore<Post>("posts/");

      await users.set(
        "1",
        { name: "Alice", email: "alice@test.com" },
        { createdBy: "test", version: 1 },
      );
      await posts.set(
        "1",
        { title: "Hello", content: "World", authorId: "1" },
        { createdBy: "test", version: 1 },
      );

      const allKeys: string[] = [];
      for await (const key of kv.keys()) {
        allKeys.push(key);
      }

      expect(allKeys.sort()).toEqual(["posts/1", "users/1"]);
    });
  });

  describe("nested sub-stores", () => {
    it("supports nested getStore calls", async (ctx) => {
      const { kv } = ctx;
      const tenantA = kv.getStore<User>("tenants/a/");
      const tenantB = kv.getStore<User>("tenants/b/");

      await tenantA.set(
        "user1",
        { name: "Alice", email: "alice@a.com" },
        { createdBy: "test", version: 1 },
      );
      await tenantB.set(
        "user1",
        { name: "Bob", email: "bob@b.com" },
        { createdBy: "test", version: 1 },
      );

      const resultA = await tenantA.get("user1");
      const resultB = await tenantB.get("user1");

      expect(resultA.exists).toBe(true);
      expect(resultB.exists).toBe(true);
      if (resultA.exists && resultB.exists) {
        expect((await resultA.value).name).toBe("Alice");
        expect((await resultB.value).name).toBe("Bob");
      }
    });

    it("parent can list all tenant keys", async (ctx) => {
      const { kv } = ctx;
      const tenantA = kv.getStore<User>("tenants/a/");
      const tenantB = kv.getStore<User>("tenants/b/");

      await tenantA.set(
        "user1",
        { name: "Alice", email: "alice@a.com" },
        { createdBy: "test", version: 1 },
      );
      await tenantB.set(
        "user1",
        { name: "Bob", email: "bob@b.com" },
        { createdBy: "test", version: 1 },
      );

      const tenantKeys: string[] = [];
      for await (const key of kv.keys("tenants/")) {
        tenantKeys.push(key);
      }

      expect(tenantKeys.sort()).toEqual(["tenants/a/user1", "tenants/b/user1"]);
    });
  });

  describe("stream access", () => {
    it("provides stream access through sub-store", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "stream-test",
        { name: "Test", email: "test@example.com" },
        { createdBy: "test", version: 1 },
      );

      const result = await users.get("stream-test");
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
        const parsed = JSON.parse(bytes.toString("utf-8"));
        expect(parsed.name).toBe("Test");
      }
    });
  });

  describe("keysShallow", () => {
    it("returns only direct children without /", async (ctx) => {
      const { kv } = ctx;
      const store = kv.getStore<User>("items/");

      await store.set(
        "top-level",
        { name: "A", email: "a@test.com" },
        { createdBy: "test", version: 1 },
      );
      await store.set(
        "nested/child",
        { name: "B", email: "b@test.com" },
        { createdBy: "test", version: 1 },
      );
      await store.set(
        "another",
        { name: "C", email: "c@test.com" },
        { createdBy: "test", version: 1 },
      );

      const keys: string[] = [];
      for await (const key of store.keysShallow()) {
        keys.push(key);
      }

      expect(keys.sort()).toEqual(["another", "top-level"]);
      expect(keys).not.toContain("nested/child");
    });
  });

  describe("getMany", () => {
    it("fetches multiple typed keys with prefix stripping", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "1",
        { name: "Alice", email: "alice@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "2",
        { name: "Bob", email: "bob@test.com" },
        { createdBy: "test", version: 1 },
      );

      const results = await users.getMany(["1", "2", "3"]);

      expect(results.size).toBe(2);
      expect(results.has("1")).toBe(true);
      expect(results.has("2")).toBe(true);
      expect(results.has("3")).toBe(false);
    });
  });

  describe("keys().page() and entries().page()", () => {
    it("returns paginated keys", async (ctx) => {
      const { kv } = ctx;
      const store = kv.getStore<User>("pg/");

      for (let i = 0; i < 5; i++) {
        await store.set(
          `k${i}`,
          { name: `User${i}`, email: `u${i}@test.com` },
          { createdBy: "test", version: 1 },
        );
      }

      const page1 = await store.keys().page(3);
      expect(page1.keys.length).toBe(3);
      expect(page1.cursor).toBeDefined();

      const page2 = await store.keys().page(3, page1.cursor);
      expect(page2.keys.length).toBe(2);
      expect(page2.cursor).toBeUndefined();
    });

    it("returns paginated entries", async (ctx) => {
      const { kv } = ctx;
      const store = kv.getStore<User>("epg/");

      for (let i = 0; i < 5; i++) {
        await store.set(
          `e${i}`,
          { name: `User${i}`, email: `u${i}@test.com` },
          { createdBy: "test", version: 1 },
        );
      }

      const page1 = await store.entries().page(3);
      expect(page1.entries.length).toBe(3);
      expect(page1.cursor).toBeDefined();

      const page2 = await store.entries().page(3, page1.cursor);
      expect(page2.entries.length).toBe(2);
      expect(page2.cursor).toBeUndefined();
    });
  });

  describe("constructor errors", () => {
    it("throws when prefix ends with .value", (ctx) => {
      const { kv } = ctx;
      let threw = false;
      try {
        kv.getStore<User>("bad.value");
      } catch (e) {
        threw = true;
        expect((e as Error).message).toContain(".value");
      }
      expect(threw).toBe(true);
    });
  });

  describe("reindex error", () => {
    it("throws when no indexes defined", async (ctx) => {
      const { kv } = ctx;
      const store = kv.getStore<User>("no-idx/");

      let threw = false;
      try {
        await store.reindex();
      } catch (e) {
        threw = true;
        expect((e as Error).message).toContain("No indexes defined");
      }
      expect(threw).toBe(true);
    });
  });

  describe("entries", () => {
    it("returns entries with stripped prefix", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "1",
        { name: "Alice", email: "alice@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "2",
        { name: "Bob", email: "bob@test.com" },
        { createdBy: "test", version: 2 },
      );

      const entries: Array<
        [string, User, { createdBy: string; version: number }]
      > = [];
      for await (const [key, entry] of users.entries()) {
        entries.push([key, await entry.value, entry.metadata]);
      }

      expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
        [
          "1",
          { name: "Alice", email: "alice@test.com" },
          { createdBy: "test", version: 1 },
        ],
        [
          "2",
          { name: "Bob", email: "bob@test.com" },
          { createdBy: "test", version: 2 },
        ],
      ]);
    });

    it("entries with prefix filters within sub-store", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "admin/1",
        { name: "Admin1", email: "admin1@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "admin/2",
        { name: "Admin2", email: "admin2@test.com" },
        { createdBy: "test", version: 1 },
      );
      await users.set(
        "regular/1",
        { name: "Regular1", email: "regular@test.com" },
        { createdBy: "test", version: 1 },
      );

      const entries: Array<[string, User]> = [];
      for await (const [key, entry] of users.entries("admin/")) {
        entries.push([key, await entry.value]);
      }

      expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
        ["admin/1", { name: "Admin1", email: "admin1@test.com" }],
        ["admin/2", { name: "Admin2", email: "admin2@test.com" }],
      ]);
    });

    it("entries returns empty for no matches", async (ctx) => {
      const { kv } = ctx;
      const users = kv.getStore<User>("users/");

      await users.set(
        "1",
        { name: "A", email: "a@test.com" },
        { createdBy: "test", version: 1 },
      );

      const entries: Array<[string, User]> = [];
      for await (const [key, entry] of users.entries("nonexistent/")) {
        entries.push([key, await entry.value]);
      }

      expect(entries).toEqual([]);
    });
  });
});

interface TestMeta {
  createdBy: string;
  version: number;
}

interface IndexedDoc {
  title: string;
  slug: string;
  status: "draft" | "published";
  tags: string[];
  updatedAt?: string;
}

describe("TypedKV unique index keys/entries queries", () => {
  setupTestContext();

  function createIndexedStore(ctx: KVTestContext) {
    return ctx.kv.getStore<IndexedDoc, TestMeta>("uq/").withIndexes({
      bySlug: { key: (doc) => doc.slug, unique: true },
    });
  }

  it("keys() on unique index returns key via iterator", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const keys: string[] = [];
    for await (const k of store.keys({ bySlug: "hello" })) {
      keys.push(k);
    }
    expect(keys).toEqual(["p1"]);
  });

  it("keys() on unique index returns key via page", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const { keys } = await store.keys({ bySlug: "hello" }).page(10);
    expect(keys).toEqual(["p1"]);
  });

  it("keys() on unique index page with cursor returns empty", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const { keys } = await store
      .keys({ bySlug: "hello" })
      .page(10, "some-cursor");
    expect(keys).toEqual([]);
  });

  it("entries() on unique index returns entry via iterator", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const entries: Array<[string, IndexedDoc]> = [];
    for await (const [key, entry] of store.entries({ bySlug: "hello" })) {
      entries.push([key, await entry.value]);
    }
    expect(entries).toEqual([
      ["p1", { title: "Hello", slug: "hello", status: "draft", tags: [] }],
    ]);
  });

  it("entries() on unique index returns entry via page", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const { entries } = await store.entries({ bySlug: "hello" }).page(10);
    expect(entries.length).toBe(1);
    expect(entries[0][0]).toBe("p1");
    expect(await entries[0][1].value).toEqual({
      title: "Hello",
      slug: "hello",
      status: "draft",
      tags: [],
    });
  });

  it("entries() on unique index page with cursor returns empty", async (ctx) => {
    const store = createIndexedStore(ctx);
    await store.set(
      "p1",
      { title: "Hello", slug: "hello", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const { entries } = await store
      .entries({ bySlug: "hello" })
      .page(10, "some-cursor");
    expect(entries).toEqual([]);
  });

  it("keys() page returns empty for non-existent unique index key", async (ctx) => {
    const store = createIndexedStore(ctx);

    const { keys } = await store.keys({ bySlug: "nonexistent" }).page(10);
    expect(keys).toEqual([]);
  });

  it("entries() page returns empty for non-existent unique index key", async (ctx) => {
    const store = createIndexedStore(ctx);

    const { entries } = await store.entries({ bySlug: "nonexistent" }).page(10);
    expect(entries).toEqual([]);
  });
});

describe("TypedKV validation errors", () => {
  setupTestContext();

  it("keys({}) throws for empty index query", async (ctx) => {
    const store = ctx.kv
      .getStore<{ v: string }, TestMeta>("val-empty/")
      .withIndexes({
        byV: { key: (d) => d.v, unique: true },
      });

    let error: Error | undefined;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing validation
      for await (const _ of store.keys({} as any)) {
        // should not reach
      }
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error?.message).toContain("exactly one key");
  });

  it("keys() throws for unknown index", async (ctx) => {
    const store = ctx.kv
      .getStore<{ v: string }, TestMeta>("val-unk-k/")
      .withIndexes({
        byV: { key: (d) => d.v, unique: true },
      });

    let error: Error | undefined;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing validation
      for await (const _ of store.keys({ unknownIdx: "x" } as any)) {
        // should not reach
      }
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error?.message).toContain("Unknown index");
  });

  it("entries() throws for unknown index", async (ctx) => {
    const store = ctx.kv
      .getStore<{ v: string }, TestMeta>("val-unk-e/")
      .withIndexes({
        byV: { key: (d) => d.v, unique: true },
      });

    let error: Error | undefined;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing validation
      for await (const _ of store.entries({ unknownIdx: "x" } as any)) {
        // should not reach
      }
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error?.message).toContain("Unknown index");
  });
});

describe("TypedKV nested getStore", () => {
  setupTestContext();

  it("creates sub-store from TypedKV with set/get", async (ctx) => {
    const parent = ctx.kv.getStore<User>("parent/");
    const child = parent.getStore<User>("child/");

    await child.set(
      "u1",
      { name: "Alice", email: "alice@test.com" },
      { createdBy: "test", version: 1 },
    );

    const result = await child.get("u1");
    expect(result.exists).toBe(true);
    if (result.exists) {
      expect((await result.value).name).toBe("Alice");
    }

    // Parent should see the key with child prefix
    const parentResult = await parent.get("child/u1");
    expect(parentResult.exists).toBe(true);
  });
});

describe("TypedKV orphan cleanup via .page()", () => {
  setupTestContext();

  function createStore(ctx: KVTestContext) {
    return ctx.kv.getStore<IndexedDoc, TestMeta>("orphan-pg/").withIndexes({
      bySlug: { key: (doc) => doc.slug, unique: true },
      byStatus: { key: (doc) => doc.status },
      byUpdatedAt: { key: (doc) => doc.updatedAt ?? "" },
    });
  }

  function createPlainStore(ctx: KVTestContext): TypedKV<IndexedDoc, TestMeta> {
    return ctx.kv.getStore<IndexedDoc>("orphan-pg/");
  }

  it("non-unique keys().page() orphan: deleted main entry", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      { title: "A", slug: "a", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );
    await store.set(
      "p2",
      { title: "B", slug: "b", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.delete("p1");

    const { keys } = await store.keys({ byStatus: "draft" }).page(10);
    expect(keys).toEqual(["p2"]);
  });

  it("non-unique keys().page() orphan: stale value", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      { title: "A", slug: "a1", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    // Change status bypassing index maintenance
    const plain = createPlainStore(ctx);
    await plain.set(
      "p1",
      { title: "A", slug: "a1", status: "published", tags: [] },
      { createdBy: "test", version: 2 },
    );

    const { keys } = await store.keys({ byStatus: "draft" }).page(10);
    expect(keys).toEqual([]);
  });

  it("non-unique entries().page() orphan: deleted main entry", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      { title: "A", slug: "a2", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.delete("p1");

    const { entries } = await store.entries({ byStatus: "draft" }).page(10);
    expect(entries).toEqual([]);
  });

  it("non-unique entries().page() orphan: stale value", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      { title: "A", slug: "a3", status: "draft", tags: [] },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.set(
      "p1",
      { title: "A", slug: "a3", status: "published", tags: [] },
      { createdBy: "test", version: 2 },
    );

    const { entries } = await store.entries({ byStatus: "draft" }).page(10);
    expect(entries).toEqual([]);
  });

  it("prefix scan keys().page() orphan: stale value", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      {
        title: "Jan",
        slug: "jan1",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-15",
      },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.set(
      "p1",
      {
        title: "Jan",
        slug: "jan1",
        status: "draft",
        tags: [],
        updatedAt: "2024-02-01",
      },
      { createdBy: "test", version: 2 },
    );

    const { keys } = await store
      .keys({ byUpdatedAt: { prefix: "2024-01" } })
      .page(10);
    expect(keys).toEqual([]);
  });

  it("prefix scan keys().page() orphan: deleted main entry", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      {
        title: "Jan",
        slug: "jan2",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-15",
      },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.delete("p1");

    const { keys } = await store
      .keys({ byUpdatedAt: { prefix: "2024-01" } })
      .page(10);
    expect(keys).toEqual([]);
  });

  it("prefix scan entries().page() orphan: stale value", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      {
        title: "Jan",
        slug: "jan3",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-15",
      },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.set(
      "p1",
      {
        title: "Jan",
        slug: "jan3",
        status: "draft",
        tags: [],
        updatedAt: "2024-02-01",
      },
      { createdBy: "test", version: 2 },
    );

    const { entries } = await store
      .entries({ byUpdatedAt: { prefix: "2024-01" } })
      .page(10);
    expect(entries).toEqual([]);
  });

  it("prefix scan entries().page() orphan: deleted main entry", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      {
        title: "Jan",
        slug: "jan4",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-15",
      },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    await plain.delete("p1");

    const { entries } = await store
      .entries({ byUpdatedAt: { prefix: "2024-01" } })
      .page(10);
    expect(entries).toEqual([]);
  });

  it("prefix scan entries iterator orphan: both types", async (ctx) => {
    const store = createStore(ctx);
    await store.set(
      "p1",
      {
        title: "Deleted",
        slug: "del1",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-10",
      },
      { createdBy: "test", version: 1 },
    );
    await store.set(
      "p2",
      {
        title: "Stale",
        slug: "stale1",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-20",
      },
      { createdBy: "test", version: 1 },
    );
    await store.set(
      "p3",
      {
        title: "Valid",
        slug: "valid1",
        status: "draft",
        tags: [],
        updatedAt: "2024-01-30",
      },
      { createdBy: "test", version: 1 },
    );

    const plain = createPlainStore(ctx);
    // Delete p1 (orphan type 1)
    await plain.delete("p1");
    // Change p2's updatedAt (orphan type 2)
    await plain.set(
      "p2",
      {
        title: "Stale",
        slug: "stale1",
        status: "draft",
        tags: [],
        updatedAt: "2024-02-01",
      },
      { createdBy: "test", version: 2 },
    );

    const entries: Array<[string, IndexedDoc]> = [];
    for await (const [key, entry] of store.entries({
      byUpdatedAt: { prefix: "2024-01" },
    })) {
      entries.push([key, await entry.value]);
    }
    expect(entries.length).toBe(1);
    expect(entries[0][0]).toBe("p3");
  });
});
