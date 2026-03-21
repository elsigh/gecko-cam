/**
 * Core test definitions that can be run with either vitest or vitest-compat.
 * These functions accept the testing primitives as parameters to allow
 * framework-agnostic test definitions.
 */
import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "./fake-blob-store.js";
import { uniqueTestPrefix } from "./index.js";
function createTestKV(options) {
    const prefix = uniqueTestPrefix();
    const blobStore = new FakeBlobStore();
    const kv = new KV2({
        prefix,
        blobStore,
        ...options,
    });
    return { kv, blobStore, prefix };
}
export function registerCoreTests(t) {
    const { describe, it, expect, beforeEach, afterEach } = t;
    let blobStore;
    let kv;
    let prefix;
    describe("KV2", () => {
        beforeEach(() => {
            prefix = uniqueTestPrefix();
            blobStore = new FakeBlobStore();
            kv = new KV2({ prefix, blobStore });
        });
        afterEach(() => {
            blobStore.clear();
        });
        describe("get", () => {
            it("returns exists: false for missing key", async () => {
                const result = await kv.get("nonexistent");
                expect(result.exists).toBe(false);
            });
            it("returns exists: true with value and metadata for existing key", async () => {
                await kv.set("key", "value", { createdBy: "test", version: 1 });
                const result = await kv.get("key");
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect(await result.value).toBe("value");
                    expect(result.metadata.createdBy).toBe("test");
                    expect(result.metadata.version).toBe(1);
                }
            });
            it("provides stream access to raw bytes", async () => {
                const data = { message: "hello" };
                await kv.set("stream-test", data, { createdBy: "test", version: 1 });
                const result = await kv.get("stream-test");
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
                    const bytes = Buffer.concat(chunks);
                    expect(bytes.length).toBeGreaterThan(0);
                }
            });
        });
        describe("set", () => {
            it("overwrites existing key", async () => {
                await kv.set("key", "first", { createdBy: "test", version: 1 });
                await kv.set("key", "second", { createdBy: "test", version: 2 });
                const result = await kv.get("key");
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect(await result.value).toBe("second");
                    expect(result.metadata.version).toBe(2);
                }
            });
            it("stores JSON objects", async () => {
                const obj = { name: "Alice", age: 30, nested: { value: true } };
                await kv.set("object", obj, { createdBy: "test", version: 1 });
                const result = await kv.get("object");
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect(await result.value).toEqual(obj);
                }
            });
            it("stores boolean values", async () => {
                await kv.set("bool-true", true, { createdBy: "test", version: 1 });
                await kv.set("bool-false", false, { createdBy: "test", version: 1 });
                const trueResult = await kv.get("bool-true");
                const falseResult = await kv.get("bool-false");
                expect(trueResult.exists).toBe(true);
                expect(falseResult.exists).toBe(true);
                if (trueResult.exists)
                    expect(await trueResult.value).toBe(true);
                if (falseResult.exists)
                    expect(await falseResult.value).toBe(false);
            });
        });
        describe("delete", () => {
            it("removes key", async () => {
                await kv.set("key", "value", { createdBy: "test", version: 1 });
                await kv.delete("key");
                const result = await kv.get("key");
                expect(result.exists).toBe(false);
            });
        });
        describe("keys", () => {
            it("returns all keys", async () => {
                await kv.set("a", "1", { createdBy: "test", version: 1 });
                await kv.set("b", "2", { createdBy: "test", version: 1 });
                await kv.set("c", "3", { createdBy: "test", version: 1 });
                const keys = [];
                for await (const key of kv.keys()) {
                    keys.push(key);
                }
                expect(keys.sort()).toEqual(["a", "b", "c"]);
            });
            it("returns keys matching prefix", async () => {
                await kv.set("users/1", "a", { createdBy: "test", version: 1 });
                await kv.set("users/2", "b", { createdBy: "test", version: 1 });
                await kv.set("posts/1", "c", { createdBy: "test", version: 1 });
                const keys = [];
                for await (const key of kv.keys("users/")) {
                    keys.push(key);
                }
                expect(keys.sort()).toEqual(["users/1", "users/2"]);
            });
        });
    });
}
export function registerBinaryTests(t) {
    const { describe, it, expect, beforeEach, afterEach } = t;
    let blobStore;
    let kv;
    describe("KV2 binary values", () => {
        beforeEach(() => {
            blobStore = new FakeBlobStore();
            kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
            });
        });
        afterEach(() => {
            blobStore.clear();
        });
        it("stores and retrieves Buffer values", async () => {
            const buffer = Buffer.from([1, 2, 3, 4, 5]);
            await kv.set("buffer", buffer, { createdBy: "test", version: 1 });
            const result = await kv.get("buffer");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(Buffer.isBuffer(value)).toBe(true);
                expect(value).toEqual(buffer);
            }
        });
        it("stores and retrieves Uint8Array values", async () => {
            const uint8 = new Uint8Array([10, 20, 30, 40, 50]);
            await kv.set("uint8", uint8, { createdBy: "test", version: 1 });
            const result = await kv.get("uint8");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect([...value]).toEqual([...uint8]);
            }
        });
    });
}
export function registerLargeValueTests(t) {
    const { describe, it, expect, beforeEach, afterEach } = t;
    let blobStore;
    let kv;
    describe("KV2 large values", () => {
        beforeEach(() => {
            blobStore = new FakeBlobStore();
            kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
                largeValueThreshold: 100,
            });
        });
        afterEach(() => {
            blobStore.clear();
        });
        it("stores and retrieves large string values", async () => {
            const largeString = "x".repeat(500);
            await kv.set("large-string", largeString, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("large-string");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe(largeString);
            }
        });
        it("stores and retrieves large JSON objects", async () => {
            const largeObject = {
                data: "x".repeat(500),
                nested: { more: "y".repeat(200) },
            };
            await kv.set("large-object", largeObject, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("large-object");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toEqual(largeObject);
            }
        });
        it("stores and retrieves large binary values", async () => {
            const largeBinary = Buffer.alloc(500, 0xab);
            await kv.set("large-binary", largeBinary, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("large-binary");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(500);
                expect(value.every((b) => b === 0xab)).toBe(true);
            }
        });
    });
}
export function registerTypedKVTests(t) {
    const { describe, it, expect, beforeEach, afterEach } = t;
    let blobStore;
    let kv;
    describe("TypedKV (getStore)", () => {
        beforeEach(() => {
            blobStore = new FakeBlobStore();
            kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
            });
        });
        afterEach(() => {
            blobStore.clear();
        });
        it("creates typed sub-KV with prefix", async () => {
            const users = kv.getStore("users/");
            await users.set("1", { name: "Alice", email: "alice@example.com" }, {
                createdBy: "test",
                version: 1,
            });
            const result = await users.get("1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect((await result.value).name).toBe("Alice");
            }
        });
        it("isolates keys between stores", async () => {
            const store1 = kv.getStore("store1/");
            const store2 = kv.getStore("store2/");
            await store1.set("key", "value1", { createdBy: "test", version: 1 });
            await store2.set("key", "value2", { createdBy: "test", version: 1 });
            const r1 = await store1.get("key");
            const r2 = await store2.get("key");
            expect(r1.exists).toBe(true);
            expect(r2.exists).toBe(true);
            if (r1.exists)
                expect(await r1.value).toBe("value1");
            if (r2.exists)
                expect(await r2.value).toBe("value2");
        });
    });
}
export function registerStreamingTests(t) {
    const { describe, it, expect, beforeEach, afterEach } = t;
    let blobStore;
    let kv;
    describe("KV2 streaming input", () => {
        beforeEach(() => {
            blobStore = new FakeBlobStore();
            kv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore,
            });
        });
        afterEach(() => {
            blobStore.clear();
        });
        it("accepts ReadableStream as value", async () => {
            const data = Buffer.from("streaming data test");
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("stream-input", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("stream-input");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value).toEqual(data);
            }
        });
        it("handles multi-chunk stream", async () => {
            const chunks = [
                Buffer.from("chunk1-"),
                Buffer.from("chunk2-"),
                Buffer.from("chunk3"),
            ];
            let index = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (index < chunks.length) {
                        controller.enqueue(chunks[index++]);
                    }
                    else {
                        controller.close();
                    }
                },
            });
            await kv.set("multi-chunk", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("multi-chunk");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.toString()).toBe("chunk1-chunk2-chunk3");
            }
        });
    });
}
export function registerStressTests(t) {
    const { describe, it, expect } = t;
    const STRESS_COUNT = 20;
    describe("Stress tests", () => {
        it(`handles ${STRESS_COUNT} concurrent writes`, async () => {
            const { kv } = createTestKV();
            const writes = Array.from({ length: STRESS_COUNT }, (_, i) => kv.set(`key-${i}`, { index: i }, { createdBy: "stress", version: i }));
            await Promise.all(writes);
            for (let i = 0; i < STRESS_COUNT; i++) {
                const result = await kv.get(`key-${i}`);
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect((await result.value).index).toBe(i);
                }
            }
        });
        it(`handles ${STRESS_COUNT} concurrent reads`, async () => {
            const { kv } = createTestKV();
            for (let i = 0; i < STRESS_COUNT; i++) {
                await kv.set(`read-${i}`, { index: i }, { createdBy: "stress", version: 1 });
            }
            const reads = Array.from({ length: STRESS_COUNT }, (_, i) => kv.get(`read-${i}`));
            const results = await Promise.all(reads);
            for (let i = 0; i < STRESS_COUNT; i++) {
                const result = results[i];
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect((await result.value).index).toBe(i);
                }
            }
        });
        it("handles rapid read-after-write", async () => {
            const { kv } = createTestKV();
            for (let i = 0; i < 10; i++) {
                await kv.set("rapid", { iteration: i }, { createdBy: "test", version: i });
                const result = await kv.get("rapid");
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect((await result.value).iteration).toBe(i);
                }
            }
        });
    });
}
export function registerAllTests(t) {
    registerCoreTests(t);
    registerBinaryTests(t);
    registerLargeValueTests(t);
    registerTypedKVTests(t);
    registerStreamingTests(t);
    registerStressTests(t);
}
//# sourceMappingURL=core-tests.js.map