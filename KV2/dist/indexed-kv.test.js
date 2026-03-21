import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
import { KVIndexConflictError } from "./types.js";
describe("TypedKV indexes", () => {
    setupTestContext();
    function createStore(ctx) {
        return ctx.kv.getStore("doc/", {
            bySlug: {
                key: (doc) => doc.slug,
                unique: true,
            },
            byStatus: {
                key: (doc) => doc.status,
            },
            byTag: {
                key: (doc) => doc.tags,
            },
            byCreatedAt: {
                key: (doc) => doc.createdAt ?? "",
            },
        });
    }
    // Plain store on same prefix — bypasses index maintenance (for orphan tests)
    function createPlainStore(ctx) {
        return ctx.kv.getStore("doc/");
    }
    describe("basic CRUD with auto-maintained indexes", () => {
        it("set creates index entries, get by primary key works", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello",
                slug: "hello",
                status: "draft",
                tags: ["intro"],
            }, { createdBy: "test", version: 1 });
            const result = await store.get("page/1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.title).toBe("Hello");
                expect(value.slug).toBe("hello");
            }
        });
        it("get with index returns entry via unique index", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello",
                slug: "hello-world",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const result = await store.get({ bySlug: "hello-world" });
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.title).toBe("Hello");
                expect(result.metadata.createdBy).toBe("test");
            }
        });
        it("get with index returns not found for missing index key", async (ctx) => {
            const store = createStore(ctx);
            const result = await store.get({ bySlug: "nonexistent" });
            expect(result.exists).toBe(false);
        });
        it("delete removes main entry and index entries", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello",
                slug: "hello",
                status: "draft",
                tags: ["a", "b"],
            }, { createdBy: "test", version: 1 });
            await store.delete("page/1");
            // Primary key gone
            const result = await store.get("page/1");
            expect(result.exists).toBe(false);
            // Unique index gone
            const slugResult = await store.get({ bySlug: "hello" });
            expect(slugResult.exists).toBe(false);
            // Non-unique index gone
            const keys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                keys.push(k);
            }
            expect(keys).toEqual([]);
            // Multi-value index gone
            const tagKeys = [];
            for await (const k of store.keys({ byTag: "a" })) {
                tagKeys.push(k);
            }
            expect(tagKeys).toEqual([]);
        });
        it("delete on non-existent key is a no-op", async (ctx) => {
            const store = createStore(ctx);
            await store.delete("page/nonexistent");
        });
    });
    describe("unique index enforcement", () => {
        it("throws KVIndexConflictError on duplicate unique index key", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "First",
                slug: "hello",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            let error;
            try {
                await store.set("page/2", {
                    title: "Second",
                    slug: "hello",
                    status: "draft",
                    tags: [],
                }, { createdBy: "test", version: 1 });
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error).toBeInstanceOf(KVIndexConflictError);
            expect(error.indexName).toBe("bySlug");
            expect(error.indexKey).toBe("hello");
        });
        it("allows same primary key to re-set same unique value", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "First",
                slug: "hello",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Same primary key, same slug — should succeed
            await store.set("page/1", {
                title: "Updated",
                slug: "hello",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 2 });
            const result = await store.get({ bySlug: "hello" });
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.title).toBe("Updated");
            }
        });
    });
    describe("multi-value indexes", () => {
        it("creates index entries for each tag", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Tagged Post",
                slug: "tagged",
                status: "draft",
                tags: ["javascript", "typescript", "nodejs"],
            }, { createdBy: "test", version: 1 });
            for (const tag of ["javascript", "typescript", "nodejs"]) {
                const keys = [];
                for await (const k of store.keys({ byTag: tag })) {
                    keys.push(k);
                }
                expect(keys).toEqual(["page/1"]);
            }
        });
        it("removes old tags and adds new on update", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "post",
                status: "draft",
                tags: ["a", "b"],
            }, { createdBy: "test", version: 1 });
            await store.set("page/1", {
                title: "Post",
                slug: "post",
                status: "draft",
                tags: ["b", "c"],
            }, { createdBy: "test", version: 2 });
            // "a" should be gone
            const aKeys = [];
            for await (const k of store.keys({ byTag: "a" })) {
                aKeys.push(k);
            }
            expect(aKeys).toEqual([]);
            // "b" should remain
            const bKeys = [];
            for await (const k of store.keys({ byTag: "b" })) {
                bKeys.push(k);
            }
            expect(bKeys).toEqual(["page/1"]);
            // "c" should be new
            const cKeys = [];
            for await (const k of store.keys({ byTag: "c" })) {
                cKeys.push(k);
            }
            expect(cKeys).toEqual(["page/1"]);
        });
    });
    describe("update index keys", () => {
        it("old slug index deleted, new slug index created on update", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "old-slug",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/1", {
                title: "Post",
                slug: "new-slug",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 2 });
            const oldResult = await store.get({ bySlug: "old-slug" });
            expect(oldResult.exists).toBe(false);
            const newResult = await store.get({ bySlug: "new-slug" });
            expect(newResult.exists).toBe(true);
            if (newResult.exists) {
                expect((await newResult.value).slug).toBe("new-slug");
            }
        });
        it("entry.update() maintains indexes", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "original",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Use entry.update() to change the slug
            const result = await store.get("page/1");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                await result.update({ ...value, slug: "updated", status: "published" }, { createdBy: "test", version: 2 });
            }
            // Old index entries should be gone
            const oldSlug = await store.get({ bySlug: "original" });
            expect(oldSlug.exists).toBe(false);
            const oldStatus = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                oldStatus.push(k);
            }
            expect(oldStatus).toEqual([]);
            // New index entries should exist
            const newSlug = await store.get({ bySlug: "updated" });
            expect(newSlug.exists).toBe(true);
            const newStatus = [];
            for await (const k of store.keys({ byStatus: "published" })) {
                newStatus.push(k);
            }
            expect(newStatus).toEqual(["page/1"]);
        });
        it("entry.update() via index lookup maintains indexes", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "my-post",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Look up by unique index, then update
            const result = await store.get({ bySlug: "my-post" });
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                await result.update({ ...value, slug: "renamed-post" }, { createdBy: "test", version: 2 });
            }
            // Old slug gone, new slug works
            const oldResult = await store.get({ bySlug: "my-post" });
            expect(oldResult.exists).toBe(false);
            const newResult = await store.get({ bySlug: "renamed-post" });
            expect(newResult.exists).toBe(true);
            if (newResult.exists) {
                expect((await newResult.value).slug).toBe("renamed-post");
            }
        });
        it("entry.update() via entries() iteration maintains indexes", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Draft",
                slug: "draft1",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Update via entries() iteration
            for await (const [, entry] of store.entries({ byStatus: "draft" })) {
                const value = await entry.value;
                await entry.update({ ...value, status: "published" }, { createdBy: "test", version: 2 });
            }
            // Draft index should be empty, published should have the entry
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys).toEqual([]);
            const pubKeys = [];
            for await (const k of store.keys({ byStatus: "published" })) {
                pubKeys.push(k);
            }
            expect(pubKeys).toEqual(["page/1"]);
        });
        it("old status index deleted, new status index created on update", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "post",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/1", {
                title: "Post",
                slug: "post",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 2 });
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys).toEqual([]);
            const pubKeys = [];
            for await (const k of store.keys({ byStatus: "published" })) {
                pubKeys.push(k);
            }
            expect(pubKeys).toEqual(["page/1"]);
        });
    });
    describe("non-unique index scan", () => {
        it("returns multiple entries with same index value", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Draft 1",
                slug: "draft1",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/2", {
                title: "Draft 2",
                slug: "draft2",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/3", {
                title: "Published",
                slug: "pub1",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys.sort()).toEqual(["page/1", "page/2"]);
            const draftEntries = [];
            for await (const [key, entry] of store.entries({ byStatus: "draft" })) {
                const value = await entry.value;
                draftEntries.push([key, value.title]);
            }
            draftEntries.sort((a, b) => a[0].localeCompare(b[0]));
            expect(draftEntries).toEqual([
                ["page/1", "Draft 1"],
                ["page/2", "Draft 2"],
            ]);
            const pubKeys = [];
            for await (const k of store.keys({ byStatus: "published" })) {
                pubKeys.push(k);
            }
            expect(pubKeys).toEqual(["page/3"]);
        });
    });
    describe("pagination", () => {
        it("keys by index pagination works", async (ctx) => {
            const store = createStore(ctx);
            for (let i = 0; i < 5; i++) {
                await store.set(`page/${i}`, {
                    title: `Draft ${i}`,
                    slug: `draft-${i}`,
                    status: "draft",
                    tags: [],
                }, { createdBy: "test", version: 1 });
            }
            const page1 = await store.keys({ byStatus: "draft" }).page(3);
            expect(page1.keys.length).toBe(3);
            if (page1.cursor) {
                const page2 = await store
                    .keys({ byStatus: "draft" })
                    .page(3, page1.cursor);
                expect(page2.keys.length).toBe(2);
            }
            const allKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                allKeys.push(k);
            }
            expect(allKeys.length).toBe(5);
        });
        it("entries by index pagination works", async (ctx) => {
            const store = createStore(ctx);
            for (let i = 0; i < 4; i++) {
                await store.set(`page/${i}`, {
                    title: `Pub ${i}`,
                    slug: `pub-${i}`,
                    status: "published",
                    tags: [],
                }, { createdBy: "test", version: 1 });
            }
            const page1 = await store.entries({ byStatus: "published" }).page(2);
            expect(page1.entries.length).toBe(2);
            if (page1.cursor) {
                const page2 = await store
                    .entries({ byStatus: "published" })
                    .page(2, page1.cursor);
                expect(page2.entries.length).toBe(2);
            }
        });
    });
    describe("keys and entries passthrough", () => {
        it("keys() returns primary keys without index pollution", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "One",
                slug: "one",
                status: "draft",
                tags: ["a"],
            }, { createdBy: "test", version: 1 });
            await store.set("page/2", {
                title: "Two",
                slug: "two",
                status: "published",
                tags: ["b"],
            }, { createdBy: "test", version: 1 });
            const keys = [];
            for await (const k of store.keys()) {
                keys.push(k);
            }
            expect(keys.sort()).toEqual(["page/1", "page/2"]);
        });
        it("entries() returns all entries", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "One",
                slug: "one",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const entries = [];
            for await (const [key, entry] of store.entries()) {
                entries.push([key, (await entry.value).title]);
            }
            expect(entries).toEqual([["page/1", "One"]]);
        });
    });
    describe("reindex", () => {
        it("builds indexes for data written without indexes", async (ctx) => {
            // Write data via plain store (no index maintenance)
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "First",
                slug: "first",
                status: "draft",
                tags: ["a"],
            }, { createdBy: "test", version: 1 });
            await plain.set("page/2", {
                title: "Second",
                slug: "second",
                status: "published",
                tags: ["a", "b"],
            }, { createdBy: "test", version: 1 });
            // Indexes don't exist yet
            const store = createStore(ctx);
            const before = await store.get({ bySlug: "first" });
            expect(before.exists).toBe(false);
            // Reindex
            const result = await store.reindex();
            expect(result.indexed).toBe(2);
            // Now indexes work
            const after = await store.get({ bySlug: "first" });
            expect(after.exists).toBe(true);
            if (after.exists) {
                expect((await after.value).title).toBe("First");
            }
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys).toEqual(["page/1"]);
            const tagKeys = [];
            for await (const k of store.keys({ byTag: "a" })) {
                tagKeys.push(k);
            }
            expect(tagKeys.sort()).toEqual(["page/1", "page/2"]);
        });
        it("reindex specific index only", async (ctx) => {
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Post",
                slug: "post",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const store = createStore(ctx);
            await store.reindex("bySlug");
            // bySlug works
            const slugResult = await store.get({ bySlug: "post" });
            expect(slugResult.exists).toBe(true);
            // byStatus was not reindexed
            const statusKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                statusKeys.push(k);
            }
            expect(statusKeys).toEqual([]);
        });
        it("reindex is idempotent", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "post",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.reindex();
            await store.reindex();
            const result = await store.get({ bySlug: "post" });
            expect(result.exists).toBe(true);
        });
    });
    describe("prefix index queries", () => {
        it("prefix scan on non-unique index returns matching entries", async (ctx) => {
            const store = createStore(ctx);
            await store.set("order/1", {
                title: "Jan Order",
                slug: "jan-order",
                status: "draft",
                tags: [],
                createdAt: "2024-01-15",
            }, { createdBy: "test", version: 1 });
            await store.set("order/2", {
                title: "Jan Order 2",
                slug: "jan-order-2",
                status: "draft",
                tags: [],
                createdAt: "2024-01-20",
            }, { createdBy: "test", version: 1 });
            await store.set("order/3", {
                title: "Feb Order",
                slug: "feb-order",
                status: "draft",
                tags: [],
                createdAt: "2024-02-10",
            }, { createdBy: "test", version: 1 });
            // Prefix scan for January 2024
            const janKeys = [];
            for await (const k of store.keys({
                byCreatedAt: { prefix: "2024-01" },
            })) {
                janKeys.push(k);
            }
            expect(janKeys.sort()).toEqual(["order/1", "order/2"]);
            // Prefix scan for February 2024
            const febKeys = [];
            for await (const k of store.keys({
                byCreatedAt: { prefix: "2024-02" },
            })) {
                febKeys.push(k);
            }
            expect(febKeys).toEqual(["order/3"]);
        });
        it("empty prefix returns all entries sorted by index", async (ctx) => {
            const store = createStore(ctx);
            await store.set("order/b", {
                title: "Second",
                slug: "second",
                status: "draft",
                tags: [],
                createdAt: "2024-02-01",
            }, { createdBy: "test", version: 1 });
            await store.set("order/a", {
                title: "First",
                slug: "first",
                status: "draft",
                tags: [],
                createdAt: "2024-01-01",
            }, { createdBy: "test", version: 1 });
            await store.set("order/c", {
                title: "Third",
                slug: "third",
                status: "published",
                tags: [],
                createdAt: "2024-03-01",
            }, { createdBy: "test", version: 1 });
            // Empty prefix = all entries, sorted by createdAt
            const keys = [];
            for await (const k of store.keys({
                byCreatedAt: { prefix: "" },
            })) {
                keys.push(k);
            }
            // Results come sorted by index value (lexicographic)
            expect(keys).toEqual(["order/a", "order/b", "order/c"]);
        });
        it("prefix scan with entries() returns full entries", async (ctx) => {
            const store = createStore(ctx);
            await store.set("order/1", {
                title: "Jan Order",
                slug: "jan1",
                status: "draft",
                tags: [],
                createdAt: "2024-01-15",
            }, { createdBy: "test", version: 1 });
            await store.set("order/2", {
                title: "Feb Order",
                slug: "feb1",
                status: "draft",
                tags: [],
                createdAt: "2024-02-10",
            }, { createdBy: "test", version: 1 });
            const results = [];
            for await (const [key, entry] of store.entries({
                byCreatedAt: { prefix: "2024-01" },
            })) {
                results.push([key, (await entry.value).title]);
            }
            expect(results).toEqual([["order/1", "Jan Order"]]);
        });
        it("prefix scan with pagination", async (ctx) => {
            const store = createStore(ctx);
            for (let i = 0; i < 5; i++) {
                await store.set(`order/${i}`, {
                    title: `Order ${i}`,
                    slug: `order-${i}`,
                    status: "draft",
                    tags: [],
                    createdAt: `2024-01-${String(i + 10).padStart(2, "0")}`,
                }, { createdBy: "test", version: 1 });
            }
            const page1 = await store
                .keys({ byCreatedAt: { prefix: "2024-01" } })
                .page(3);
            expect(page1.keys.length).toBe(3);
            if (page1.cursor) {
                const page2 = await store
                    .keys({ byCreatedAt: { prefix: "2024-01" } })
                    .page(3, page1.cursor);
                expect(page2.keys.length).toBe(2);
            }
            // entries pagination
            const ePage1 = await store
                .entries({ byCreatedAt: { prefix: "2024-01" } })
                .page(2);
            expect(ePage1.entries.length).toBe(2);
            if (ePage1.cursor) {
                const ePage2 = await store
                    .entries({ byCreatedAt: { prefix: "2024-01" } })
                    .page(2, ePage1.cursor);
                expect(ePage2.entries.length).toBe(2);
            }
        });
        it("prefix scan on unique index", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello World",
                slug: "hello-world",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/2", {
                title: "Hello Again",
                slug: "hello-again",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/3", {
                title: "Goodbye",
                slug: "goodbye",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Prefix scan on unique bySlug index
            const helloKeys = [];
            for await (const k of store.keys({
                bySlug: { prefix: "hello" },
            })) {
                helloKeys.push(k);
            }
            expect(helloKeys.sort()).toEqual(["page/1", "page/2"]);
            // Entries prefix scan on unique index
            const helloEntries = [];
            for await (const [key, entry] of store.entries({
                bySlug: { prefix: "hello" },
            })) {
                helloEntries.push([key, (await entry.value).title]);
            }
            helloEntries.sort((a, b) => a[0].localeCompare(b[0]));
            expect(helloEntries).toEqual([
                ["page/1", "Hello World"],
                ["page/2", "Hello Again"],
            ]);
        });
        it("get() rejects prefix queries", async (ctx) => {
            const store = createStore(ctx);
            let error;
            try {
                await store.get({ bySlug: { prefix: "hello" } });
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error?.message).toContain("prefix");
        });
        it("prefix scan returns no results for non-matching prefix", async (ctx) => {
            const store = createStore(ctx);
            await store.set("order/1", {
                title: "Order",
                slug: "order1",
                status: "draft",
                tags: [],
                createdAt: "2024-01-15",
            }, { createdBy: "test", version: 1 });
            const keys = [];
            for await (const k of store.keys({
                byCreatedAt: { prefix: "2025" },
            })) {
                keys.push(k);
            }
            expect(keys).toEqual([]);
        });
    });
    describe("error cases", () => {
        it("get throws for unknown index", async (ctx) => {
            const store = createStore(ctx);
            let error;
            try {
                // biome-ignore lint/suspicious/noExplicitAny: testing error handling with invalid input
                await store.get({ nonexistent: "key" });
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error?.message).toContain("Unknown index");
        });
        it("get throws for non-unique index", async (ctx) => {
            const store = createStore(ctx);
            let error;
            try {
                await store.get({ byStatus: "draft" });
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error?.message).toContain("non-unique");
        });
    });
});
//# sourceMappingURL=indexed-kv.test.js.map