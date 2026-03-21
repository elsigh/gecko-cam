import { KVCache, encodeCacheKey } from "./cache.js";
import { FakeCache } from "./testing/fake-cache.js";
import { afterEach as baseAfterEach, beforeEach as baseBeforeEach, it as baseIt, describe, expect, } from "./testing/vitest-compat.js";
const it = (name, fn) => {
    baseIt(name, fn);
};
const beforeEach = (fn) => {
    baseBeforeEach(fn);
};
const afterEach = (fn) => {
    baseAfterEach(fn);
};
describe("KVCache", () => {
    beforeEach((ctx) => {
        ctx.errors = [];
        ctx.fakeCache = new FakeCache();
        ctx.cache = new KVCache({
            ttl: 3600,
            cache: ctx.fakeCache,
            onError: (message, error) => ctx.errors.push({ message, error }),
        });
    });
    afterEach((ctx) => {
        ctx.fakeCache.clear();
    });
    describe("get", () => {
        it("returns cached value on success", async (ctx) => {
            const { cache, fakeCache } = ctx;
            const mockData = { metadata: { foo: "bar" }, value: "test", size: 100 };
            fakeCache.inject("cached-kv:test/path", mockData);
            const result = await cache.get("test/path");
            expect(result).toEqual(mockData);
            expect(fakeCache.getCallsFor("get").length).toBe(1);
            expect(fakeCache.getCallsFor("get")[0].args[0]).toBe("cached-kv:test/path");
        });
        it("returns null and logs error on failure", async (ctx) => {
            const { cache, fakeCache, errors } = ctx;
            fakeCache.failGet(new Error("Cache unavailable"));
            const result = await cache.get("test/path");
            expect(result).toBeNull();
            expect(errors.length).toBe(1);
            expect(errors[0].message).toContain("cache read failed");
            expect(errors[0].error.message).toBe("Cache unavailable");
        });
    });
    describe("set", () => {
        it("sets cache entry on success", async (ctx) => {
            const { cache, fakeCache } = ctx;
            const entry = { metadata: { foo: "bar" }, value: "test", size: 100 };
            await cache.set("test/path", entry);
            const setCalls = fakeCache.getCallsFor("set");
            expect(setCalls.length).toBe(1);
            expect(setCalls[0].args[0]).toBe("cached-kv:test/path");
            expect(setCalls[0].args[1]).toEqual(entry);
            expect(setCalls[0].args[2]).toEqual({
                tags: ["cached-kv:test/path"],
                ttl: 3600,
            });
        });
        it("skips cache for entries larger than 1MB", async (ctx) => {
            const { cache, fakeCache } = ctx;
            const entry = {
                metadata: { foo: "bar" },
                value: "test",
                size: 2 * 1024 * 1024,
            };
            await cache.set("test/path", entry);
            expect(fakeCache.getCallsFor("set").length).toBe(0);
        });
        it("logs error on failure but does not throw", async (ctx) => {
            const { cache, fakeCache, errors } = ctx;
            fakeCache.failSet(new Error("Cache write failed"));
            const entry = { metadata: { foo: "bar" }, value: "test", size: 100 };
            await cache.set("test/path", entry); // Should not throw
            expect(errors.length).toBe(1);
            expect(errors[0].message).toContain("cache write failed");
            expect(errors[0].error.message).toBe("Cache write failed");
        });
    });
    describe("invalidate", () => {
        it("invalidates cache on success", async (ctx) => {
            const { cache, fakeCache } = ctx;
            await cache.invalidate("test/path");
            const expireCalls = fakeCache.getCallsFor("expireTag");
            expect(expireCalls.length).toBe(1);
            expect(expireCalls[0].args[0]).toEqual(["cached-kv:test/path"]);
        });
        it("retries 3 times with backoff on failure", async (ctx) => {
            const { cache, fakeCache, errors } = ctx;
            fakeCache.failExpireTag(new Error("Invalidation failed"));
            await cache.invalidate("test/path");
            // Should have tried 3 times
            expect(fakeCache.getCallsFor("expireTag").length).toBe(3);
            // Should have logged failures (4 total: 3 attempts + 1 final)
            expect(errors.length).toBe(4);
            // First 3 are retry attempts
            expect(errors[0].message).toContain("attempt 1/3");
            expect(errors[1].message).toContain("attempt 2/3");
            expect(errors[2].message).toContain("attempt 3/3");
            // Last is the final failure
            expect(errors[3].message).toContain("giving up");
        });
        it("succeeds on retry after initial failure", async (ctx) => {
            const { cache, fakeCache, errors } = ctx;
            const error = new Error("Temporary failure");
            fakeCache.failExpireTagOnce(error);
            await cache.invalidate("test/path");
            // Should have tried twice (first fails, second succeeds)
            expect(fakeCache.getCallsFor("expireTag").length).toBe(2);
            // Only first failure logged
            expect(errors.length).toBe(1);
            expect(errors[0].message).toContain("attempt 1/3");
            expect(errors[0].error.message).toBe("Temporary failure");
        });
        it("does not throw after all retries exhausted", async (ctx) => {
            const { cache, fakeCache } = ctx;
            const error = new Error("Persistent failure");
            fakeCache.failExpireTag(error);
            await expect(cache.invalidate("test/path")).resolves.toBeUndefined();
        });
    });
});
describe("KVCache legacy constructor", () => {
    baseIt("accepts a number as TTL (legacy)", async () => {
        const cache = new KVCache(1800);
        // The constructor should not throw
        // We can't easily test the TTL is applied without a full setup,
        // but we verify construction succeeds
        expect(cache).toBeDefined();
    });
});
describe("encodeCacheKey", () => {
    baseIt("passes through ASCII alphanumeric characters", () => {
        expect(encodeCacheKey("abcXYZ123")).toBe("abcXYZ123");
    });
    baseIt('passes through ASCII punctuation (except %, ", and +)', () => {
        expect(encodeCacheKey("path/to/key.value")).toBe("path/to/key.value");
        expect(encodeCacheKey("a-b_c:d")).toBe("a-b_c:d");
        expect(encodeCacheKey("foo!bar")).toBe("foo!bar");
    });
    baseIt("encodes percent sign to avoid ambiguity", () => {
        expect(encodeCacheKey("100%")).toBe("100%25");
        expect(encodeCacheKey("a%b%c")).toBe("a%25b%25c");
    });
    baseIt("encodes double quotes", () => {
        expect(encodeCacheKey('say "hello"')).toBe("say+%22hello%22");
    });
    baseIt("converts spaces to + for readability", () => {
        expect(encodeCacheKey("hello world")).toBe("hello+world");
        expect(encodeCacheKey("a b c")).toBe("a+b+c");
    });
    baseIt("encodes literal + to avoid collision with space", () => {
        expect(encodeCacheKey("a+b")).toBe("a%2Bb");
        expect(encodeCacheKey("1+1=2")).toBe("1%2B1=2");
        // Verify no collision between space and +
        expect(encodeCacheKey("a b")).not.toBe(encodeCacheKey("a+b"));
    });
    baseIt("encodes unicode characters", () => {
        // Korean
        expect(encodeCacheKey("키")).toBe("%ED%82%A4");
        // Emoji
        expect(encodeCacheKey("test🎉")).toBe("test%F0%9F%8E%89");
        // Chinese
        expect(encodeCacheKey("中文")).toBe("%E4%B8%AD%E6%96%87");
        // Mixed
        expect(encodeCacheKey("path/유니코드/key")).toBe("path/%EC%9C%A0%EB%8B%88%EC%BD%94%EB%93%9C/key");
    });
    baseIt("encodes control characters", () => {
        expect(encodeCacheKey("line1\nline2")).toBe("line1%0Aline2");
        expect(encodeCacheKey("col1\tcol2")).toBe("col1%09col2");
        expect(encodeCacheKey("cr\rhere")).toBe("cr%0Dhere");
        expect(encodeCacheKey("null\0byte")).toBe("null%00byte");
    });
    baseIt("handles empty string", () => {
        expect(encodeCacheKey("")).toBe("");
    });
    baseIt("handles typical cache key paths", () => {
        // Standard path
        expect(encodeCacheKey("cached-kv/app/users/123.value")).toBe("cached-kv/app/users/123.value");
        // Path with unicode key
        expect(encodeCacheKey("cached-kv/app/users/사용자.value")).toBe("cached-kv/app/users/%EC%82%AC%EC%9A%A9%EC%9E%90.value");
        // Path with spaces in key
        expect(encodeCacheKey("cached-kv/app/my key.value")).toBe("cached-kv/app/my+key.value");
    });
    baseIt("is idempotent for already-safe strings", () => {
        const safe = "cached-kv/test/path.value";
        expect(encodeCacheKey(safe)).toBe(safe);
        expect(encodeCacheKey(encodeCacheKey(safe))).toBe(safe);
    });
    baseIt("handles all ASCII printable range correctly", () => {
        // Characters 0x21-0x7E except %, ", and +
        const printable = "!#$&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
        const expected = printable
            .replace(/%/g, "%25")
            .replace(/"/g, "%22")
            .replace(/\+/g, "%2B");
        expect(encodeCacheKey(printable)).toBe(expected);
    });
});
//# sourceMappingURL=cache.test.js.map