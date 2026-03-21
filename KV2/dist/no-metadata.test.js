import { KV2 } from "./cached-kv.js";
import { FakeBlobStore } from "./testing/fake-blob-store.js";
import { createTestKV, uniqueTestPrefix, useRealBlobStore, } from "./testing/index.js";
import { afterEach, beforeEach, describe, expect, it, } from "./testing/vitest-compat.js";
/**
 * Tests for KV2 without metadata type parameter.
 * When no metadata type is specified, metadata should be optional.
 */
describe("KV2 without metadata", () => {
    beforeEach((ctx) => {
        const testCtx = ctx;
        if (useRealBlobStore()) {
            const result = createTestKV({
                prefix: uniqueTestPrefix(),
            });
            testCtx.kv = result.kv;
            testCtx.blobStore = undefined;
            testCtx.cleanup = result.cleanup;
            testCtx.isReal = true;
        }
        else {
            const blobStore = new FakeBlobStore();
            testCtx.kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
            });
            testCtx.blobStore = blobStore;
            testCtx.cleanup = async () => blobStore.clear();
            testCtx.isReal = false;
        }
    });
    afterEach(async (ctx) => {
        const { cleanup } = ctx;
        await cleanup();
    });
    describe("set without metadata", () => {
        it("can set value without metadata argument", async (ctx) => {
            const { kv } = ctx;
            // No metadata argument at all
            await kv.set("key1", "value1");
            const result = await kv.get("key1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("value1");
            }
        });
        it("can set value with undefined metadata", async (ctx) => {
            const { kv } = ctx;
            // Explicitly passing undefined
            await kv.set("key2", "value2", undefined);
            const result = await kv.get("key2");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("value2");
            }
        });
        it("can set JSON objects without metadata", async (ctx) => {
            const { kv } = ctx;
            const user = { name: "Alice", email: "alice@example.com" };
            await kv.set("user1", user);
            const result = await kv.get("user1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.name).toBe("Alice");
                expect(value.email).toBe("alice@example.com");
            }
        });
        it("can set binary data without metadata", async (ctx) => {
            const { kv } = ctx;
            const buffer = Buffer.from("binary data");
            await kv.set("binary1", buffer);
            const result = await kv.get("binary1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.toString("utf-8")).toBe("binary data");
            }
        });
    });
    describe("get returns undefined metadata", () => {
        it("metadata is undefined when key exists", async (ctx) => {
            const { kv } = ctx;
            await kv.set("meta-test", "value");
            const result = await kv.get("meta-test");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(result.metadata).toBeUndefined();
            }
        });
        it("metadata is undefined when key does not exist", async (ctx) => {
            const { kv } = ctx;
            const result = await kv.get("nonexistent");
            expect(result.exists).toBe(false);
            expect(result.metadata).toBeUndefined();
        });
    });
    describe("overwrite without metadata", () => {
        it("can overwrite existing key without metadata", async (ctx) => {
            const { kv } = ctx;
            await kv.set("overwrite-key", "first");
            await kv.set("overwrite-key", "second");
            const result = await kv.get("overwrite-key");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("second");
            }
        });
    });
    describe("delete without metadata", () => {
        it("can delete key set without metadata", async (ctx) => {
            const { kv } = ctx;
            await kv.set("to-delete", "value");
            const before = await kv.get("to-delete");
            expect(before.exists).toBe(true);
            await kv.delete("to-delete");
            const after = await kv.get("to-delete");
            expect(after.exists).toBe(false);
        });
    });
    describe("keys without metadata", () => {
        it("lists keys set without metadata", async (ctx) => {
            const { kv } = ctx;
            await kv.set("list-a", "a");
            await kv.set("list-b", "b");
            await kv.set("list-c", "c");
            const keys = [];
            for await (const key of kv.keys()) {
                keys.push(key);
            }
            expect(keys.sort()).toEqual(["list-a", "list-b", "list-c"]);
        });
    });
    describe("stream without metadata", () => {
        it("can stream value set without metadata", async (ctx) => {
            const { kv } = ctx;
            const data = { id: 123, items: ["a", "b", "c"] };
            await kv.set("stream-key", data);
            const result = await kv.get("stream-key");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const stream = await result.stream;
                const reader = stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunks.push(value);
                }
                const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
                expect(parsed.id).toBe(123);
                expect(parsed.items).toEqual(["a", "b", "c"]);
            }
        });
    });
});
describe("TypedKV (getStore) without metadata", () => {
    beforeEach((ctx) => {
        const testCtx = ctx;
        if (useRealBlobStore()) {
            const result = createTestKV({
                prefix: uniqueTestPrefix(),
            });
            testCtx.kv = result.kv;
            testCtx.blobStore = undefined;
            testCtx.cleanup = result.cleanup;
            testCtx.isReal = true;
        }
        else {
            const blobStore = new FakeBlobStore();
            testCtx.kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
            });
            testCtx.blobStore = blobStore;
            testCtx.cleanup = async () => blobStore.clear();
            testCtx.isReal = false;
        }
    });
    afterEach(async (ctx) => {
        const { cleanup } = ctx;
        await cleanup();
    });
    describe("basic operations", () => {
        it("can create typed store and set without metadata", async (ctx) => {
            const { kv } = ctx;
            const users = kv.getStore("users/");
            await users.set("123", { name: "Alice", email: "alice@example.com" });
            const result = await users.get("123");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.name).toBe("Alice");
                expect(value.email).toBe("alice@example.com");
                expect(result.metadata).toBeUndefined();
            }
        });
        it("can use multiple typed stores without metadata", async (ctx) => {
            const { kv } = ctx;
            const users = kv.getStore("users/");
            const posts = kv.getStore("posts/");
            await users.set("u1", { name: "Bob", email: "bob@example.com" });
            await posts.set("p1", { title: "Hello", content: "World" });
            const user = await users.get("u1");
            const post = await posts.get("p1");
            expect(user.exists).toBe(true);
            expect(post.exists).toBe(true);
            if (user.exists) {
                expect((await user.value).name).toBe("Bob");
                expect(user.metadata).toBeUndefined();
            }
            if (post.exists) {
                expect((await post.value).title).toBe("Hello");
                expect(post.metadata).toBeUndefined();
            }
        });
        it("can delete from typed store without metadata", async (ctx) => {
            const { kv } = ctx;
            const users = kv.getStore("users/");
            await users.set("to-delete", {
                name: "Delete",
                email: "delete@test.com",
            });
            await users.delete("to-delete");
            const result = await users.get("to-delete");
            expect(result.exists).toBe(false);
        });
        it("can list keys from typed store without metadata", async (ctx) => {
            const { kv } = ctx;
            const users = kv.getStore("users/");
            await users.set("a", { name: "A", email: "a@test.com" });
            await users.set("b", { name: "B", email: "b@test.com" });
            const keys = [];
            for await (const key of users.keys()) {
                keys.push(key);
            }
            expect(keys.sort()).toEqual(["a", "b"]);
        });
    });
});
//# sourceMappingURL=no-metadata.test.js.map