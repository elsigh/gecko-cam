import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { FakeCache } from "../testing/fake-cache.js";
import { uniqueTestPrefix } from "../testing/index.js";
import { describe, expect } from "../testing/vitest-compat.js";
import { afterEach as baseAfterEach, beforeEach as baseBeforeEach, it as baseIt, } from "../testing/vitest-compat.js";
const it = (name, fn) => {
    baseIt(name, fn);
};
const beforeEach = (fn) => {
    baseBeforeEach(fn);
};
const afterEach = (fn) => {
    baseAfterEach(fn);
};
/**
 * Chaos tests for cache behavior.
 * These tests explore cache invalidation timing, failures, and edge cases.
 */
describe("Chaos: Cache Behavior", () => {
    beforeEach((ctx) => {
        ctx.prefix = uniqueTestPrefix();
        ctx.blobStore = new FakeBlobStore();
        ctx.fakeCache = new FakeCache();
        ctx.kv = new KV2({
            prefix: ctx.prefix,
            blobStore: ctx.blobStore,
            cache: ctx.fakeCache,
        });
    });
    afterEach((ctx) => {
        ctx.blobStore.clear();
        ctx.fakeCache.clear();
    });
    describe("cache hit scenarios", () => {
        it("should return cached value when cache hit", async (ctx) => {
            const { kv, fakeCache, prefix } = ctx;
            const cachedEntry = {
                metadata: { createdBy: "cached", version: 99 },
                value: "cached-value",
                size: 50,
                etag: `"fake-etag-cached"`,
            };
            fakeCache.inject(`cached-kv:cached-kv/${prefix}cached-key.value`, cachedEntry);
            const result = await kv.get("cached-key");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("cached-value");
                expect(result.metadata.version).toBe(99);
            }
        });
        it("should handle stale cache returning wrong type", async (ctx) => {
            const { kv, fakeCache, prefix } = ctx;
            const staleCache = {
                metadata: { createdBy: "stale", version: 1 },
                value: { old: "format" },
                size: 50,
                etag: `"fake-etag-stale"`,
            };
            fakeCache.inject(`cached-kv:cached-kv/${prefix}wrong-type.value`, staleCache);
            const result = await kv.get("wrong-type");
            expect(result.exists).toBe(true);
            if (result.exists) {
                // We get whatever was in cache, even if type doesn't match
                const value = await result.value;
                expect(value).toEqual({ old: "format" });
            }
        });
        it("should return stream from cache hit", async (ctx) => {
            const { kv, fakeCache, prefix } = ctx;
            const cachedEntry = {
                metadata: { createdBy: "cached", version: 1 },
                value: { data: "cached-stream-data" },
                size: 50,
                etag: `"fake-etag-stream"`,
            };
            fakeCache.inject(`cached-kv:cached-kv/${prefix}stream-cache-hit.value`, cachedEntry);
            const result = await kv.get("stream-cache-hit");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const stream = await result.stream;
                expect(stream).toBeInstanceOf(ReadableStream);
                const reader = stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunks.push(value);
                }
                const content = Buffer.concat(chunks).toString("utf-8");
                expect(JSON.parse(content)).toEqual({ data: "cached-stream-data" });
            }
        });
    });
    describe("cache miss scenarios", () => {
        it("should read from blob and populate cache on miss", async (ctx) => {
            const { kv, fakeCache } = ctx;
            // Pre-populate blob store via set
            await kv.set("miss-test", "from-blob", { createdBy: "test", version: 1 });
            // Clear cache to simulate miss
            fakeCache.clear();
            const result = await kv.get("miss-test");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value).toBe("from-blob");
                // Cache should have been populated
                expect(fakeCache.getCallsFor("set").length).toBeGreaterThan(0);
            }
        });
        it("should handle cache get failure gracefully", async (ctx) => {
            const { kv, fakeCache } = ctx;
            fakeCache.failGetOnce(new Error("Cache unavailable"));
            await kv.set("fallback", "value", { createdBy: "test", version: 1 });
            fakeCache.clear(); // Clear to force read from blob
            fakeCache.failGetOnce(new Error("Cache unavailable"));
            const result = await kv.get("fallback");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("value");
            }
        });
    });
    describe("cache write on set", () => {
        it("should write to cache on set", async (ctx) => {
            const { kv, fakeCache } = ctx;
            await kv.set("cache-on-set", "value", { createdBy: "test", version: 1 });
            expect(fakeCache.getCallsFor("set").length).toBeGreaterThan(0);
        });
        it("should write correct value to cache", async (ctx) => {
            const { kv, fakeCache } = ctx;
            await kv.set("cache-value", { data: "test" }, { createdBy: "test", version: 1 });
            const setCalls = fakeCache.getCallsFor("set");
            expect(setCalls.length).toBeGreaterThan(0);
            const lastCall = setCalls[setCalls.length - 1];
            const entry = lastCall.args[1];
            expect(entry.metadata).toEqual({ createdBy: "test", version: 1 });
            expect(entry.value).toEqual({ data: "test" });
        });
    });
    describe("cache invalidation on delete", () => {
        it("should invalidate cache on delete", async (ctx) => {
            const { kv, fakeCache } = ctx;
            await kv.set("to-delete", "value", { createdBy: "test", version: 1 });
            fakeCache.clearCalls();
            await kv.delete("to-delete");
            expect(fakeCache.getCallsFor("expireTag").length).toBeGreaterThan(0);
        });
        it("should retry invalidation on failure", async (ctx) => {
            const { kv, fakeCache } = ctx;
            // First two calls fail, third succeeds
            fakeCache.failExpireTagOnce(new Error("Fail 1"));
            fakeCache.failExpireTagOnce(new Error("Fail 2"));
            await kv.delete("retry-test");
            // 2 failed attempts (1 call each) + 1 success (1 call) = 3 calls
            expect(fakeCache.getCallsFor("expireTag").length).toBe(3);
        });
        it("should continue after max retries exhausted", async (ctx) => {
            const { kv, fakeCache } = ctx;
            fakeCache.failExpireTag(new Error("Persistent failure"));
            // Should not throw even if invalidation fails
            await kv.delete("persistent-fail"); // Would throw if not handled
            // Should have tried 3 times (INVALIDATE_RETRIES)
            expect(fakeCache.getCallsFor("expireTag").length).toBe(3);
        });
    });
    describe("cache consistency scenarios", () => {
        it("should see own writes (read-your-writes)", async (ctx) => {
            const { kv, fakeCache } = ctx;
            await kv.set("ryw", "first", { createdBy: "test", version: 1 });
            // Clear cache to simulate eventual consistency lag
            fakeCache.clear();
            const result = await kv.get("ryw");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("first");
            }
            await kv.set("ryw", "second", { createdBy: "test", version: 2 });
            fakeCache.clear();
            const result2 = await kv.get("ryw");
            expect(result2.exists).toBe(true);
            if (result2.exists) {
                expect(await result2.value).toBe("second");
            }
        });
    });
    describe("cache key collision scenarios", () => {
        it("should handle different prefixes having similar keys", async (ctx) => {
            const { blobStore, fakeCache } = ctx;
            const kv1 = new KV2({
                prefix: "prefix-a/",
                blobStore,
                cache: fakeCache,
            });
            const kv2 = new KV2({
                prefix: "prefix-b/",
                blobStore,
                cache: fakeCache,
            });
            await kv1.set("same-key", "value-a", { createdBy: "a", version: 1 });
            await kv2.set("same-key", "value-b", { createdBy: "b", version: 1 });
            fakeCache.clear();
            const r1 = await kv1.get("same-key");
            const r2 = await kv2.get("same-key");
            expect(r1.exists && (await r1.value)).toBe("value-a");
            expect(r2.exists && (await r2.value)).toBe("value-b");
        });
    });
    describe("cache TTL edge cases", () => {
        it("should use configured TTL", async (ctx) => {
            const { prefix, blobStore, fakeCache } = ctx;
            const customTtl = 7200;
            const kvWithTtl = new KV2({
                prefix,
                blobStore,
                cache: fakeCache,
                cacheTtl: customTtl,
            });
            fakeCache.clear();
            await kvWithTtl.set("ttl-test", "value", {
                createdBy: "test",
                version: 1,
            });
            const result = await kvWithTtl.get("ttl-test");
            if (result.exists) {
                await result.value; // Trigger cache set
                const setCalls = fakeCache.getCallsFor("set");
                const lastSetCall = setCalls[setCalls.length - 1];
                if (lastSetCall?.args[2]) {
                    expect(lastSetCall.args[2].ttl).toBe(customTtl);
                }
            }
        });
    });
    describe("cache failure resilience", () => {
        it("should work when cache.set fails", async (ctx) => {
            const { kv, fakeCache } = ctx;
            fakeCache.failSet(new Error("Cache write failed"));
            await kv.set("set-fail", "value", { createdBy: "test", version: 1 });
            fakeCache.clear();
            fakeCache.failGet(new Error("Cache read failed"));
            const result = await kv.get("set-fail");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("value");
            }
        });
        it("should handle intermittent cache failures", async (ctx) => {
            const { kv, fakeCache } = ctx;
            await kv.set("intermittent", "value", { createdBy: "test", version: 1 });
            // Simulate intermittent failures
            fakeCache.clear();
            fakeCache.failGetOnce(new Error("Fail"));
            const r1 = await kv.get("intermittent");
            const r2 = await kv.get("intermittent");
            const r3 = await kv.get("intermittent");
            expect(r1.exists && (await r1.value)).toBe("value");
            expect(r2.exists && (await r2.value)).toBe("value");
            expect(r3.exists && (await r3.value)).toBe("value");
        });
    });
    describe("binary value caching", () => {
        it("should correctly cache and return binary values", async (ctx) => {
            const { kv, fakeCache } = ctx;
            const binary = Buffer.from([1, 2, 3, 4, 5]);
            await kv.set("binary-cache", binary, { createdBy: "test", version: 1 });
            // Clear and re-read
            fakeCache.clear();
            const r1 = await kv.get("binary-cache");
            expect(r1.exists).toBe(true);
            if (r1.exists) {
                const v1 = await r1.value;
                expect(Buffer.isBuffer(v1)).toBe(true);
                expect(v1).toEqual(binary);
            }
        });
    });
});
//# sourceMappingURL=cache.chaos.test.js.map