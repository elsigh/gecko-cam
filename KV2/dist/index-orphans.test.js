import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
import { KVVersionConflictError } from "./types.js";
describe("Index orphan handling", () => {
    setupTestContext();
    function createStore(ctx) {
        return ctx.kv.getStore("doc/").withIndexes({
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
            byUpdatedAt: {
                key: (doc) => doc.updatedAt ?? "",
            },
        });
    }
    // Plain store on same prefix — bypasses index maintenance (for creating orphans)
    function createPlainStore(ctx) {
        return ctx.kv.getStore("doc/");
    }
    describe("orphan type 1: index points to deleted main entry", () => {
        it("get() on unique index detects and cleans orphan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Ghost", slug: "ghost", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            // Delete main entry without cleaning indexes
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            // First read detects orphan and cleans it
            const result = await store.get({ bySlug: "ghost" });
            expect(result.exists).toBe(false);
            // Second read confirms cleanup
            const result2 = await store.get({ bySlug: "ghost" });
            expect(result2.exists).toBe(false);
        });
        it("keys() on non-unique index detects and cleans orphan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Ghost", slug: "ghost1", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            await store.set("page/2", { title: "Alive", slug: "alive1", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            // Delete one entry without cleaning indexes
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            // Scan should skip the orphan and return only the live entry
            const keys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                keys.push(k);
            }
            expect(keys).toEqual(["page/2"]);
        });
        it("entries() on non-unique index detects and cleans orphan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Ghost", slug: "ghost2", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            const entries = [];
            for await (const [key, entry] of store.entries({
                byStatus: "draft",
            })) {
                entries.push([key, await entry.value]);
            }
            expect(entries).toEqual([]);
        });
        it("page() on non-unique index detects and cleans orphan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Ghost", slug: "ghost3", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            await store.set("page/2", { title: "Alive", slug: "alive2", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            const { keys } = await store.keys({ byStatus: "draft" }).page(10);
            expect(keys).toEqual(["page/2"]);
        });
        it("multi-value index orphan cleaned on scan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Tagged",
                slug: "tagged1",
                status: "draft",
                tags: ["alpha", "beta"],
            }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            // Both tag indexes should detect the orphan
            const alphaKeys = [];
            for await (const k of store.keys({ byTag: "alpha" })) {
                alphaKeys.push(k);
            }
            expect(alphaKeys).toEqual([]);
            const betaKeys = [];
            for await (const k of store.keys({ byTag: "beta" })) {
                betaKeys.push(k);
            }
            expect(betaKeys).toEqual([]);
        });
    });
    describe("orphan type 2: index points to value with different index key", () => {
        it("get() on unique index detects stale slug", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Original",
                slug: "original-slug",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Change slug bypassing index maintenance
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Modified",
                slug: "new-slug",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 2 });
            // Old slug index is stale — should be detected
            const result = await store.get({ bySlug: "original-slug" });
            expect(result.exists).toBe(false);
        });
        it("keys() on non-unique index detects stale status", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Post", slug: "post1", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            // Change status bypassing index maintenance
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Post",
                slug: "post1",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 2 });
            // Old status index is stale
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys).toEqual([]);
        });
        it("entries() on non-unique index detects stale value", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", { title: "Post", slug: "post2", status: "draft", tags: [] }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Post",
                slug: "post2",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 2 });
            const entries = [];
            for await (const [key, entry] of store.entries({
                byStatus: "draft",
            })) {
                entries.push([key, await entry.value]);
            }
            expect(entries).toEqual([]);
        });
        it("stale multi-value index cleaned on scan", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "post3",
                status: "draft",
                tags: ["old-tag"],
            }, { createdBy: "test", version: 1 });
            // Change tags bypassing index maintenance
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Post",
                slug: "post3",
                status: "draft",
                tags: ["new-tag"],
            }, { createdBy: "test", version: 2 });
            // Old tag is stale
            const oldKeys = [];
            for await (const k of store.keys({ byTag: "old-tag" })) {
                oldKeys.push(k);
            }
            expect(oldKeys).toEqual([]);
        });
    });
    describe("orphan cleanup via prefix scan", () => {
        it("prefix scan on non-unique index skips orphan (deleted entry)", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Jan",
                slug: "jan1",
                status: "draft",
                tags: [],
                updatedAt: "2024-01-15",
            }, { createdBy: "test", version: 1 });
            await store.set("page/2", {
                title: "Jan 2",
                slug: "jan2",
                status: "draft",
                tags: [],
                updatedAt: "2024-01-20",
            }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            const keys = [];
            for await (const k of store.keys({
                byUpdatedAt: { prefix: "2024-01" },
            })) {
                keys.push(k);
            }
            expect(keys).toEqual(["page/2"]);
        });
        it("prefix scan on non-unique index skips orphan (stale value)", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Jan",
                slug: "jan3",
                status: "draft",
                tags: [],
                updatedAt: "2024-01-15",
            }, { createdBy: "test", version: 1 });
            // Change updatedAt bypassing index maintenance
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Jan",
                slug: "jan3",
                status: "draft",
                tags: [],
                updatedAt: "2024-02-01",
            }, { createdBy: "test", version: 2 });
            // Prefix scan for January should not find page/1 anymore
            const keys = [];
            for await (const k of store.keys({
                byUpdatedAt: { prefix: "2024-01" },
            })) {
                keys.push(k);
            }
            expect(keys).toEqual([]);
        });
        it("prefix scan on unique index skips orphan (deleted entry)", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello",
                slug: "hello-world",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            await store.set("page/2", {
                title: "Help",
                slug: "help-page",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            const keys = [];
            for await (const k of store.keys({
                bySlug: { prefix: "hel" },
            })) {
                keys.push(k);
            }
            expect(keys).toEqual(["page/2"]);
        });
        it("prefix scan on unique index skips orphan (stale value)", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Hello",
                slug: "hello-orphan",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            // Change slug bypassing index maintenance
            const plain = createPlainStore(ctx);
            await plain.set("page/1", {
                title: "Hello",
                slug: "goodbye-orphan",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 2 });
            // Prefix scan should detect the stale index
            const keys = [];
            for await (const k of store.keys({
                bySlug: { prefix: "hello" },
            })) {
                keys.push(k);
            }
            expect(keys).toEqual([]);
        });
    });
    describe("orphan from failed optimistic-locking update", () => {
        it("entry.update() version conflict preserves correct indexes", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Post",
                slug: "post-v1",
                status: "draft",
                tags: [],
                updatedAt: "2024-01-01",
            }, { createdBy: "test", version: 1 });
            // Read entry (captures version)
            const result = await store.get("page/1");
            expect(result.exists).toBe(true);
            if (!result.exists)
                return;
            const oldValue = await result.value;
            // Concurrent write changes slug and updatedAt
            await store.set("page/1", {
                title: "Post",
                slug: "post-v2",
                status: "published",
                tags: [],
                updatedAt: "2024-01-02",
            }, { createdBy: "test", version: 2 });
            // Original update() should fail with version conflict
            let error;
            try {
                await result.update({ ...oldValue, slug: "post-v3", updatedAt: "2024-01-03" }, { createdBy: "test", version: 3 });
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeDefined();
            expect(error).toBeInstanceOf(KVVersionConflictError);
            // Old index deletions are deferred until after main write
            // succeeds, so a failed main write does NOT delete the
            // correct indexes. Only the new (orphan) entries were created.
            // Orphan from failed update self-heals on read
            const v3Result = await store.get({ bySlug: "post-v3" });
            expect(v3Result.exists).toBe(false);
            // Correct index is still intact
            const v2Result = await store.get({ bySlug: "post-v2" });
            expect(v2Result.exists).toBe(true);
            if (v2Result.exists) {
                expect((await v2Result.value).slug).toBe("post-v2");
            }
            // Current status index is correct
            const pubKeys = [];
            for await (const k of store.keys({ byStatus: "published" })) {
                pubKeys.push(k);
            }
            expect(pubKeys).toEqual(["page/1"]);
            // Orphan status index from failed update self-heals
            const draftKeys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                draftKeys.push(k);
            }
            expect(draftKeys).toEqual([]);
        });
    });
    describe("multiple orphans in a single scan", () => {
        it("cleans multiple orphans during one iteration", async (ctx) => {
            const store = createStore(ctx);
            // Create 3 entries with same status
            for (let i = 1; i <= 3; i++) {
                await store.set(`page/${i}`, {
                    title: `Post ${i}`,
                    slug: `multi-orphan-${i}`,
                    status: "draft",
                    tags: [],
                }, { createdBy: "test", version: 1 });
            }
            // Delete all 3 bypassing indexes
            const plain = createPlainStore(ctx);
            for (let i = 1; i <= 3; i++) {
                await plain.delete(`page/${i}`);
            }
            // Single scan should detect and clean all 3 orphans
            const keys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                keys.push(k);
            }
            expect(keys).toEqual([]);
            // Verify unique index orphans also cleaned on access
            for (let i = 1; i <= 3; i++) {
                const result = await store.get({
                    bySlug: `multi-orphan-${i}`,
                });
                expect(result.exists).toBe(false);
            }
        });
        it("mix of valid and orphan entries in one scan", async (ctx) => {
            const store = createStore(ctx);
            for (let i = 1; i <= 4; i++) {
                await store.set(`page/${i}`, {
                    title: `Post ${i}`,
                    slug: `mix-${i}`,
                    status: "draft",
                    tags: [],
                }, { createdBy: "test", version: 1 });
            }
            // Delete page/2 and page/4 bypassing indexes
            const plain = createPlainStore(ctx);
            await plain.delete("page/2");
            await plain.delete("page/4");
            // Scan should return only live entries
            const keys = [];
            for await (const k of store.keys({ byStatus: "draft" })) {
                keys.push(k);
            }
            expect(keys.sort()).toEqual(["page/1", "page/3"]);
        });
    });
    describe("orphan cleanup is durable", () => {
        it("orphan cleaned on first read does not reappear", async (ctx) => {
            const store = createStore(ctx);
            await store.set("page/1", {
                title: "Ephemeral",
                slug: "ephemeral",
                status: "draft",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const plain = createPlainStore(ctx);
            await plain.delete("page/1");
            // First read cleans the orphan
            const r1 = await store.get({ bySlug: "ephemeral" });
            expect(r1.exists).toBe(false);
            // Re-create a different entry with same slug — should work
            await store.set("page/2", {
                title: "New",
                slug: "ephemeral",
                status: "published",
                tags: [],
            }, { createdBy: "test", version: 1 });
            const r2 = await store.get({ bySlug: "ephemeral" });
            expect(r2.exists).toBe(true);
            if (r2.exists) {
                expect((await r2.value).title).toBe("New");
            }
        });
    });
});
//# sourceMappingURL=index-orphans.test.js.map