import { createTestKV, it, setupTestContext, uniqueTestPrefix, } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
describe("KV2 entries", () => {
    setupTestContext();
    it("returns all entries", async (ctx) => {
        const { kv } = ctx;
        await kv.set("a", "1", { createdBy: "test", version: 1 });
        await kv.set("b", "2", { createdBy: "test", version: 2 });
        await kv.set("c", "3", { createdBy: "test", version: 3 });
        const entries = [];
        for await (const [key, entry] of kv.entries()) {
            entries.push([key, await entry.value, entry.metadata]);
        }
        expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
            ["a", "1", { createdBy: "test", version: 1 }],
            ["b", "2", { createdBy: "test", version: 2 }],
            ["c", "3", { createdBy: "test", version: 3 }],
        ]);
    });
    it("returns entries matching prefix", async (ctx) => {
        const { kv } = ctx;
        await kv.set("users/1", { name: "Alice" }, { createdBy: "test", version: 1 });
        await kv.set("users/2", { name: "Bob" }, { createdBy: "test", version: 1 });
        await kv.set("posts/1", { title: "Hello" }, { createdBy: "test", version: 1 });
        const entries = [];
        for await (const [key, entry] of kv.entries("users/")) {
            entries.push([key, await entry.value]);
        }
        expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
            ["users/1", { name: "Alice" }],
            ["users/2", { name: "Bob" }],
        ]);
    });
    it("returns empty iterator for no matches", async (ctx) => {
        const { kv } = ctx;
        await kv.set("foo", "bar", { createdBy: "test", version: 1 });
        const entries = [];
        for await (const [key, entry] of kv.entries("nonexistent/")) {
            entries.push([key, await entry.value]);
        }
        expect(entries).toEqual([]);
    });
    it("returns empty iterator for empty store", async (ctx) => {
        const { kv } = ctx;
        const entries = [];
        for await (const [key, entry] of kv.entries()) {
            entries.push([key, await entry.value]);
        }
        expect(entries).toEqual([]);
    });
    it("handles concurrent fetches correctly", async (ctx) => {
        const { kv } = ctx;
        // Create more entries than the default concurrency (10)
        for (let i = 0; i < 25; i++) {
            await kv.set(`key-${i.toString().padStart(2, "0")}`, `value-${i}`, {
                createdBy: "test",
                version: i,
            });
        }
        const entries = [];
        for await (const [key, entry] of kv.entries()) {
            entries.push([key, await entry.value]);
        }
        expect(entries.length).toBe(25);
        // Check a few values
        const sorted = entries.sort((a, b) => a[0].localeCompare(b[0]));
        expect(sorted[0]).toEqual(["key-00", "value-0"]);
        expect(sorted[24]).toEqual(["key-24", "value-24"]);
    });
    it("respects custom concurrency parameter", async (ctx) => {
        const { kv } = ctx;
        await kv.set("a", "1", { createdBy: "test", version: 1 });
        await kv.set("b", "2", { createdBy: "test", version: 1 });
        await kv.set("c", "3", { createdBy: "test", version: 1 });
        // Use concurrency of 1 (sequential)
        const entries = [];
        for await (const [key, entry] of kv.entries(undefined, 1)) {
            entries.push([key, await entry.value]);
        }
        expect(entries.length).toBe(3);
    });
    it("includes metadata in entries", async (ctx) => {
        const { kv } = ctx;
        await kv.set("test-key", { data: "test" }, { createdBy: "alice", version: 42 });
        for await (const [key, entry] of kv.entries()) {
            expect(key).toBe("test-key");
            expect(entry.metadata).toEqual({ createdBy: "alice", version: 42 });
            expect(await entry.value).toEqual({ data: "test" });
        }
    });
    it("provides working stream access", async (ctx) => {
        const { kv } = ctx;
        await kv.set("test-key", "test-value", { createdBy: "test", version: 1 });
        for await (const [, entry] of kv.entries()) {
            const stream = await entry.stream;
            const reader = stream.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            const text = new TextDecoder().decode(Buffer.concat(chunks));
            expect(JSON.parse(text)).toBe("test-value");
        }
    });
});
describe("KV2 entries with prefix option", () => {
    it("works with global prefix", async () => {
        const customPrefix = `${uniqueTestPrefix()}myapp/`;
        const { kv: prefixedKv, cleanup: prefixCleanup } = createTestKV({
            prefix: customPrefix,
        });
        await prefixedKv.set("a", "1", { createdBy: "test", version: 1 });
        await prefixedKv.set("b", "2", { createdBy: "test", version: 1 });
        const entries = [];
        for await (const [key, entry] of prefixedKv.entries()) {
            entries.push([key, await entry.value]);
        }
        expect(entries.sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
            ["a", "1"],
            ["b", "2"],
        ]);
        await prefixCleanup();
    });
});
describe("KV2 entries pagination", () => {
    setupTestContext();
    it("page returns first page of entries", async (ctx) => {
        const { kv } = ctx;
        await kv.set("a", "1", { createdBy: "test", version: 1 });
        await kv.set("b", "2", { createdBy: "test", version: 2 });
        await kv.set("c", "3", { createdBy: "test", version: 3 });
        const { entries, cursor } = await kv.entries().page(2);
        expect(entries.length).toBe(2);
        // Verify we got actual entries with values
        for (const [key, entry] of entries) {
            expect(typeof key).toBe("string");
            expect(entry.exists).toBe(true);
        }
    });
    it("page returns all entries when limit exceeds count", async (ctx) => {
        const { kv } = ctx;
        await kv.set("a", "1", { createdBy: "test", version: 1 });
        await kv.set("b", "2", { createdBy: "test", version: 2 });
        const { entries, cursor } = await kv.entries().page(10);
        expect(entries.length).toBe(2);
        expect(cursor).toBeUndefined();
        const keys = entries.map(([k]) => k).sort();
        expect(keys).toEqual(["a", "b"]);
    });
    it("page with prefix filters entries", async (ctx) => {
        const { kv } = ctx;
        await kv.set("users/1", { name: "Alice" }, { createdBy: "test", version: 1 });
        await kv.set("users/2", { name: "Bob" }, { createdBy: "test", version: 1 });
        await kv.set("posts/1", { title: "Hello" }, { createdBy: "test", version: 1 });
        const { entries } = await kv.entries("users/").page(10);
        expect(entries.length).toBe(2);
        const keys = entries.map(([k]) => k).sort();
        expect(keys).toEqual(["users/1", "users/2"]);
    });
    it("page includes metadata", async (ctx) => {
        const { kv } = ctx;
        await kv.set("test", "value", { createdBy: "alice", version: 42 });
        const { entries } = await kv.entries().page(10);
        expect(entries.length).toBe(1);
        const [key, entry] = entries[0];
        expect(key).toBe("test");
        expect(entry.metadata).toEqual({ createdBy: "alice", version: 42 });
        expect(await entry.value).toBe("value");
    });
    it("page returns empty for no matches", async (ctx) => {
        const { kv } = ctx;
        await kv.set("foo", "bar", { createdBy: "test", version: 1 });
        const { entries, cursor } = await kv.entries("nonexistent/").page(10);
        expect(entries).toEqual([]);
        expect(cursor).toBeUndefined();
    });
    it("page paginates through all entries with cursor", async (ctx) => {
        const { kv } = ctx;
        // Create enough entries to require multiple pages
        for (let i = 0; i < 10; i++) {
            await kv.set(`key-${i.toString().padStart(2, "0")}`, `value-${i}`, {
                createdBy: "test",
                version: i,
            });
        }
        const allEntries = [];
        let cursor;
        // Fetch in pages of 3
        do {
            const result = await kv.entries().page(3, cursor);
            for (const [key, entry] of result.entries) {
                allEntries.push([key, await entry.value]);
            }
            cursor = result.cursor;
        } while (cursor);
        // Should have all 10 entries
        expect(allEntries.length).toBe(10);
        const sorted = allEntries.sort((a, b) => a[0].localeCompare(b[0]));
        expect(sorted[0]).toEqual(["key-00", "value-0"]);
        expect(sorted[9]).toEqual(["key-09", "value-9"]);
    });
});
//# sourceMappingURL=cached-kv.entries.test.js.map