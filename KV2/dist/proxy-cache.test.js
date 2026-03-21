import { it as baseIt, describe, expect, } from "./testing/vitest-compat.js";
/**
 * Creates a ProxyCache-compatible object backed by a controlled fetch function.
 * This mirrors ProxyCacheImpl's behavior without touching globalThis.
 */
function createTestProxyCache(options) {
    const proxyUrl = options.proxyUrl ?? "https://cached-kv-poc.vercel.app/api/cache-proxy";
    const protectionBypass = options.protectionBypass;
    const fetchFn = options.fetch;
    const calls = [];
    function getHeaders(contentType) {
        const headers = {};
        if (contentType) {
            headers["Content-Type"] = contentType;
        }
        if (protectionBypass) {
            headers["x-vercel-protection-bypass"] = protectionBypass;
        }
        return headers;
    }
    async function doFetch(url, fetchOptions = {}) {
        calls.push({ url, options: fetchOptions });
        return fetchFn(url, fetchOptions);
    }
    return {
        getCalls: () => calls,
        async get(key) {
            const url = `${proxyUrl}?op=get`;
            const response = await doFetch(url, {
                method: "POST",
                headers: getHeaders("application/json"),
                body: JSON.stringify({ key }),
            });
            const data = (await response.json());
            if (data.error)
                throw new Error(data.error);
            return data.value;
        },
        async set(key, value, setOptions) {
            const url = `${proxyUrl}?op=set`;
            const response = await doFetch(url, {
                method: "POST",
                headers: getHeaders("application/json"),
                body: JSON.stringify({
                    key,
                    value,
                    tags: setOptions?.tags,
                    ttl: setOptions?.ttl,
                }),
            });
            const data = (await response.json());
            if (data.error)
                throw new Error(data.error);
        },
        async expireTag(tags) {
            const url = `${proxyUrl}?op=expireTag`;
            const response = await doFetch(url, {
                method: "POST",
                headers: getHeaders("application/json"),
                body: JSON.stringify({ tags }),
            });
            const data = (await response.json());
            if (data.error)
                throw new Error(data.error);
        },
    };
}
function mockFetch(responseData, status = 200) {
    return async () => new Response(JSON.stringify(responseData), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
describe("ProxyCache", () => {
    describe("get", () => {
        baseIt("sends POST with key and returns value", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ value: { hello: "world" } }),
            });
            const result = await cache.get("my-key");
            expect(result).toEqual({ hello: "world" });
            const calls = cache.getCalls();
            expect(calls.length).toBe(1);
            expect(calls[0].url).toContain("?op=get");
            expect(calls[0].options.method).toBe("POST");
            const body = JSON.parse(calls[0].options.body);
            expect(body.key).toBe("my-key");
        });
        baseIt("throws on error response", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ error: "Key not found" }),
            });
            let threw = false;
            try {
                await cache.get("missing");
            }
            catch (e) {
                threw = true;
                expect(e.message).toBe("Key not found");
            }
            expect(threw).toBe(true);
        });
        baseIt("returns undefined when value is missing", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({}),
            });
            const result = await cache.get("missing-key");
            expect(result).toBeUndefined();
        });
    });
    describe("set", () => {
        baseIt("sends POST with key, value, tags, ttl", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ success: true }),
            });
            await cache.set("my-key", { data: "value" }, { tags: ["t1"], ttl: 60 });
            const calls = cache.getCalls();
            expect(calls.length).toBe(1);
            expect(calls[0].url).toContain("?op=set");
            const body = JSON.parse(calls[0].options.body);
            expect(body.key).toBe("my-key");
            expect(body.value).toEqual({ data: "value" });
            expect(body.tags).toEqual(["t1"]);
            expect(body.ttl).toBe(60);
        });
        baseIt("throws on error response", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ error: "Write failed" }),
            });
            let threw = false;
            try {
                await cache.set("key", "value");
            }
            catch (e) {
                threw = true;
                expect(e.message).toBe("Write failed");
            }
            expect(threw).toBe(true);
        });
    });
    describe("expireTag", () => {
        baseIt("sends POST with tags", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ success: true }),
            });
            await cache.expireTag(["my-tag"]);
            const calls = cache.getCalls();
            expect(calls.length).toBe(1);
            expect(calls[0].url).toContain("?op=expireTag");
            const body = JSON.parse(calls[0].options.body);
            expect(body.tags).toEqual(["my-tag"]);
        });
        baseIt("throws on error response", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ error: "Expire failed" }),
            });
            let threw = false;
            try {
                await cache.expireTag(["bad-tag"]);
            }
            catch (e) {
                threw = true;
                expect(e.message).toBe("Expire failed");
            }
            expect(threw).toBe(true);
        });
    });
    describe("headers", () => {
        baseIt("includes protection bypass header when set", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                protectionBypass: "my-secret-token",
                fetch: mockFetch({ value: null }),
            });
            await cache.get("key");
            const headers = cache.getCalls()[0].options.headers;
            expect(headers["x-vercel-protection-bypass"]).toBe("my-secret-token");
        });
        baseIt("does not include protection bypass header when not set", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ value: null }),
            });
            await cache.get("key");
            const headers = cache.getCalls()[0].options.headers;
            expect(headers["x-vercel-protection-bypass"]).toBeUndefined();
        });
        baseIt("includes Content-Type header", async () => {
            const cache = createTestProxyCache({
                proxyUrl: "https://test.example.com/cache",
                fetch: mockFetch({ value: null }),
            });
            await cache.get("key");
            const headers = cache.getCalls()[0].options.headers;
            expect(headers["Content-Type"]).toBe("application/json");
        });
    });
    describe("constructor defaults", () => {
        baseIt("uses default proxy URL when none provided", async () => {
            const cache = createTestProxyCache({
                fetch: mockFetch({ value: null }),
            });
            await cache.get("key");
            const calls = cache.getCalls();
            expect(calls[0].url).toContain("cached-kv-poc.vercel.app");
        });
    });
});
//# sourceMappingURL=proxy-cache.test.js.map