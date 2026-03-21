import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { describe, expect, it } from "../testing/vitest-compat.js";
import { KVIndexConflictError, KVVersionConflictError } from "../types.js";
// --- Helpers ---
function encodeUrlKey(url) {
    const normalized = url.startsWith("/") ? url.slice(1) : url;
    return encodeURIComponent(normalized).replace(/%2F/g, "__");
}
function createTestKV() {
    const blobStore = new FakeBlobStore();
    const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
    const kv = new KV2({ prefix, blobStore });
    return { kv, cleanup: () => blobStore.clear() };
}
function createStores(kv) {
    const documentsKV = kv
        .getStore("document/")
        .withIndexes({
        bySlug: { key: (doc) => doc.slug, unique: true },
        byStatus: { key: (doc) => doc.status },
        byUrl: { key: (doc) => doc.urls.map(encodeUrlKey), unique: true },
    });
    const historyKV = kv.getStore("history/");
    const usersKV = kv.getStore("user/").withIndexes({
        byUsername: { key: (user) => user.username, unique: true },
    });
    const sessionsKV = kv.getStore("session/");
    return { documentsKV, historyKV, usersKV, sessionsKV };
}
function historyKey(type, id, version) {
    return `${type}/${id}/${version}`;
}
// --- Tests ---
describe("CMS patterns", () => {
    it("create document with metadata + indexes, retrieve by primary key", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        const doc = {
            type: "page",
            title: "Hello World",
            slug: "hello-world",
            status: "draft",
            content: "Welcome to our site.",
            urls: ["/hello-world"],
        };
        const meta = {
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        };
        await documentsKV.set("page/doc-1", doc, meta);
        const result = await documentsKV.get("page/doc-1");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const value = await result.value;
            expect(value.title).toBe("Hello World");
            expect(value.slug).toBe("hello-world");
            expect(result.metadata.createdBy).toBe("user-1");
            expect(result.metadata.version).toBe(1);
        }
    });
    it("retrieve document by unique index (slug)", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "About Us",
            slug: "about-us",
            status: "published",
            content: "About page content.",
            urls: ["/about"],
        }, {
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        const value = await documentsKV.getValue({ bySlug: "about-us" });
        expect(value).toBeDefined();
        expect(value.title).toBe("About Us");
    });
    it("retrieve document by multi-value unique index (encoded URL)", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        const doc = {
            type: "page",
            title: "Products Page",
            slug: "products",
            status: "published",
            content: "Our products.",
            urls: ["/products", "/shop/products"],
        };
        await documentsKV.set("page/doc-1", doc, {
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        // Look up by first URL
        const r1 = await documentsKV.get({
            byUrl: encodeUrlKey("/products"),
        });
        expect(r1.exists).toBe(true);
        if (r1.exists) {
            expect((await r1.value).title).toBe("Products Page");
        }
        // Look up by second URL (with nested path)
        const r2 = await documentsKV.get({
            byUrl: encodeUrlKey("/shop/products"),
        });
        expect(r2.exists).toBe(true);
        if (r2.exists) {
            expect((await r2.value).title).toBe("Products Page");
        }
    });
    it("list documents filtered by non-unique index (status) with pagination", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        for (let i = 0; i < 5; i++) {
            await documentsKV.set(`page/doc-${i}`, {
                type: "page",
                title: `Draft ${i}`,
                slug: `draft-${i}`,
                status: "draft",
                content: "",
                urls: [`/draft-${i}`],
            }, {
                createdBy: "user-1",
                updatedBy: "user-1",
                createdAt: 1000 + i,
                updatedAt: 1000 + i,
                version: 1,
            });
        }
        // Also add a published doc
        await documentsKV.set("page/pub-1", {
            type: "page",
            title: "Published",
            slug: "published",
            status: "published",
            content: "",
            urls: ["/published"],
        }, {
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: 2000,
            updatedAt: 2000,
            version: 1,
        });
        // Paginate drafts
        const page1 = await documentsKV
            .entries({ byStatus: "draft" })
            .page(3);
        expect(page1.entries.length).toBe(3);
        expect(page1.cursor).toBeDefined();
        const page2 = await documentsKV
            .entries({ byStatus: "draft" })
            .page(3, page1.cursor);
        expect(page2.entries.length).toBe(2);
        // Verify published has only 1
        const pubKeys = [];
        for await (const k of documentsKV.keys({ byStatus: "published" })) {
            pubKeys.push(k);
        }
        expect(pubKeys).toEqual(["page/pub-1"]);
    });
    it("list documents filtered by key prefix (type) with pagination", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        // Create pages and posts
        for (let i = 0; i < 3; i++) {
            await documentsKV.set(`page/p-${i}`, {
                type: "page",
                title: `Page ${i}`,
                slug: `page-${i}`,
                status: "draft",
                content: "",
                urls: [`/page-${i}`],
            }, {
                createdBy: "u1",
                updatedBy: "u1",
                createdAt: 1000,
                updatedAt: 1000,
                version: 1,
            });
        }
        for (let i = 0; i < 2; i++) {
            await documentsKV.set(`post/p-${i}`, {
                type: "post",
                title: `Post ${i}`,
                slug: `post-${i}`,
                status: "published",
                content: "",
                urls: [`/post-${i}`],
            }, {
                createdBy: "u1",
                updatedBy: "u1",
                createdAt: 2000,
                updatedAt: 2000,
                version: 1,
            });
        }
        // Filter by prefix "page/"
        const pageKeys = [];
        for await (const k of documentsKV.keys("page/")) {
            pageKeys.push(k);
        }
        expect(pageKeys.length).toBe(3);
        // Paginate posts
        const postPage = await documentsKV.entries("post/").page(10);
        expect(postPage.entries.length).toBe(2);
    });
    it("update document with optimistic locking + archive to history store", async () => {
        const { kv } = createTestKV();
        const { documentsKV, historyKV } = createStores(kv);
        const doc = {
            type: "page",
            title: "Original Title",
            slug: "original",
            status: "draft",
            content: "Original content.",
            urls: ["/original"],
        };
        const meta = {
            createdBy: "user-1",
            updatedBy: "user-1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        };
        const { version } = await documentsKV.set("page/doc-1", doc, meta);
        // Read current, archive, then update with expectedVersion
        const current = await documentsKV.get("page/doc-1");
        expect(current.exists).toBe(true);
        if (!current.exists)
            return;
        const oldDoc = await current.value;
        // Archive to history
        await historyKV.set(historyKey("page", "doc-1", current.metadata.version), {
            document: oldDoc,
            metadata: current.metadata,
            archivedAt: 2000,
            archivedBy: "user-2",
        });
        // Update with optimistic lock
        const updatedDoc = {
            ...oldDoc,
            title: "Updated Title",
            content: "Updated content.",
        };
        const updatedMeta = {
            ...current.metadata,
            updatedBy: "user-2",
            updatedAt: 2000,
            version: 2,
        };
        await documentsKV.set("page/doc-1", updatedDoc, updatedMeta, {
            expectedVersion: version,
        });
        // Verify current doc is updated
        const updated = await documentsKV.get("page/doc-1");
        expect(updated.exists).toBe(true);
        if (updated.exists) {
            expect((await updated.value).title).toBe("Updated Title");
            expect(updated.metadata.version).toBe(2);
        }
        // Verify history has the old version
        const hist = await historyKV.get(historyKey("page", "doc-1", 1));
        expect(hist.exists).toBe(true);
        if (hist.exists) {
            expect((await hist.value).document.title).toBe("Original Title");
        }
    });
    it("concurrent update triggers version conflict", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "V1",
            slug: "v1",
            status: "draft",
            content: "",
            urls: ["/v1"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        // Two users read the same version
        const entry1 = await documentsKV.get("page/doc-1");
        const entry2 = await documentsKV.get("page/doc-1");
        expect(entry1.exists && entry2.exists).toBe(true);
        if (!entry1.exists || !entry2.exists)
            return;
        // User 1 updates successfully
        const val1 = await entry1.value;
        await entry1.update({ ...val1, title: "V2 by user1" }, { ...entry1.metadata, updatedBy: "u1", version: 2 });
        // User 2's update should fail (stale version)
        const val2 = await entry2.value;
        let error;
        try {
            await entry2.update({ ...val2, title: "V2 by user2" }, { ...entry2.metadata, updatedBy: "u2", version: 2 });
        }
        catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(KVVersionConflictError);
    });
    it("restore document from history", async () => {
        const { kv } = createTestKV();
        const { documentsKV, historyKV } = createStores(kv);
        const originalDoc = {
            type: "page",
            title: "Original",
            slug: "restorable",
            status: "published",
            content: "Original content.",
            urls: ["/restorable"],
        };
        const originalMeta = {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            publishedAt: 1000,
            version: 1,
        };
        await documentsKV.set("page/doc-1", originalDoc, originalMeta);
        // Archive v1 and update to v2
        await historyKV.set(historyKey("page", "doc-1", 1), {
            document: originalDoc,
            metadata: originalMeta,
            archivedAt: 2000,
            archivedBy: "u1",
        });
        await documentsKV.set("page/doc-1", { ...originalDoc, title: "Changed", content: "Changed content." }, { ...originalMeta, updatedAt: 2000, version: 2 });
        // Restore from history
        const hist = await historyKV.get(historyKey("page", "doc-1", 1));
        expect(hist.exists).toBe(true);
        if (!hist.exists)
            return;
        const entry = await hist.value;
        await documentsKV.set("page/doc-1", entry.document, {
            ...entry.metadata,
            updatedAt: 3000,
            updatedBy: "u1",
            version: 3,
        });
        const restored = await documentsKV.get("page/doc-1");
        expect(restored.exists).toBe(true);
        if (restored.exists) {
            expect((await restored.value).title).toBe("Original");
            expect(restored.metadata.version).toBe(3);
        }
    });
    it("delete document, verify indexes cleaned", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "To Delete",
            slug: "to-delete",
            status: "published",
            content: "",
            urls: ["/to-delete", "/remove-me"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        await documentsKV.delete("page/doc-1");
        // Primary key gone
        expect((await documentsKV.get("page/doc-1")).exists).toBe(false);
        // Slug index gone
        expect((await documentsKV.get({ bySlug: "to-delete" })).exists).toBe(false);
        // URL indexes gone
        expect((await documentsKV.get({ byUrl: encodeUrlKey("/to-delete") })).exists).toBe(false);
        expect((await documentsKV.get({ byUrl: encodeUrlKey("/remove-me") })).exists).toBe(false);
        // Status index gone
        const pubKeys = [];
        for await (const k of documentsKV.keys({ byStatus: "published" })) {
            pubKeys.push(k);
        }
        expect(pubKeys).toEqual([]);
    });
    it("slug conflict on create (unique index)", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "First",
            slug: "taken-slug",
            status: "draft",
            content: "",
            urls: ["/first"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        let error;
        try {
            await documentsKV.set("page/doc-2", {
                type: "page",
                title: "Second",
                slug: "taken-slug",
                status: "draft",
                content: "",
                urls: ["/second"],
            }, {
                createdBy: "u1",
                updatedBy: "u1",
                createdAt: 2000,
                updatedAt: 2000,
                version: 1,
            });
        }
        catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(KVIndexConflictError);
        expect(error.indexName).toBe("bySlug");
        expect(error.indexKey).toBe("taken-slug");
    });
    it("change slug on update: old index removed, new index works", async () => {
        const { kv } = createTestKV();
        const { documentsKV } = createStores(kv);
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "Post",
            slug: "old-slug",
            status: "draft",
            content: "",
            urls: ["/old-slug"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        // Update slug and URL
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "Post",
            slug: "new-slug",
            status: "draft",
            content: "",
            urls: ["/new-slug"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 2000,
            version: 2,
        });
        // Old slug gone
        expect((await documentsKV.get({ bySlug: "old-slug" })).exists).toBe(false);
        // New slug works
        const result = await documentsKV.get({ bySlug: "new-slug" });
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect((await result.value).title).toBe("Post");
        }
        // Old URL gone, new URL works
        expect((await documentsKV.get({ byUrl: encodeUrlKey("/old-slug") })).exists).toBe(false);
        const urlResult = await documentsKV.get({
            byUrl: encodeUrlKey("/new-slug"),
        });
        expect(urlResult.exists).toBe(true);
    });
    it("multi-store isolation: documents, users, sessions don't collide", async () => {
        const { kv } = createTestKV();
        const { documentsKV, usersKV, sessionsKV } = createStores(kv);
        // Create one entry in each store
        await documentsKV.set("page/doc-1", {
            type: "page",
            title: "Doc",
            slug: "doc",
            status: "draft",
            content: "",
            urls: ["/doc"],
        }, {
            createdBy: "u1",
            updatedBy: "u1",
            createdAt: 1000,
            updatedAt: 1000,
            version: 1,
        });
        await usersKV.set("user-1", {
            id: "user-1",
            username: "alice",
            email: "alice@example.com",
            name: "Alice",
        });
        await sessionsKV.set("sess-1", {
            userId: "user-1",
            token: "abc123",
            expiresAt: 9999999,
        });
        // Each store only sees its own keys
        const docKeys = [];
        for await (const k of documentsKV.keys()) {
            docKeys.push(k);
        }
        expect(docKeys).toEqual(["page/doc-1"]);
        const userKeys = [];
        for await (const k of usersKV.keys()) {
            userKeys.push(k);
        }
        expect(userKeys).toEqual(["user-1"]);
        const sessKeys = [];
        for await (const k of sessionsKV.keys()) {
            sessKeys.push(k);
        }
        expect(sessKeys).toEqual(["sess-1"]);
    });
    it("user CRUD with username index", async () => {
        const { kv } = createTestKV();
        const { usersKV } = createStores(kv);
        // Create
        await usersKV.set("user-1", {
            id: "user-1",
            username: "bob",
            email: "bob@example.com",
            name: "Bob",
        });
        // Read by primary key
        const byId = await usersKV.get("user-1");
        expect(byId.exists).toBe(true);
        if (byId.exists) {
            expect((await byId.value).name).toBe("Bob");
        }
        // Read by username index
        const byUsername = await usersKV.get({ byUsername: "bob" });
        expect(byUsername.exists).toBe(true);
        if (byUsername.exists) {
            expect((await byUsername.value).email).toBe("bob@example.com");
        }
        // Delete
        await usersKV.delete("user-1");
        expect((await usersKV.get("user-1")).exists).toBe(false);
        expect((await usersKV.get({ byUsername: "bob" })).exists).toBe(false);
    });
    it("session create + expire (TTL-like pattern via manual check)", async () => {
        const { kv } = createTestKV();
        const { sessionsKV } = createStores(kv);
        const now = 10000;
        const ttl = 3600;
        await sessionsKV.set("sess-1", {
            userId: "user-1",
            token: "token-abc",
            expiresAt: now + ttl,
        });
        const session = await sessionsKV.get("sess-1");
        expect(session.exists).toBe(true);
        if (!session.exists)
            return;
        const value = await session.value;
        // Not expired at current time
        expect(value.expiresAt > now).toBe(true);
        // Expired at future time
        const futureTime = now + ttl + 1;
        expect(value.expiresAt <= futureTime).toBe(true);
    });
});
//# sourceMappingURL=cms-patterns.test.js.map