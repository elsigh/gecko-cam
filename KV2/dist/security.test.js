import { MAX_HEADER_SIZE } from "./blob-format.js";
import { KV2 } from "./cached-kv.js";
import { FakeBlobStore } from "./testing/fake-blob-store.js";
import { uniqueTestPrefix } from "./testing/index.js";
import { it, setupTestContext } from "./testing/test-setup.js";
import { afterEach as baseAfterEach, beforeEach as baseBeforeEach, it as baseIt, } from "./testing/vitest-compat.js";
import { describe, expect } from "./testing/vitest-compat.js";
import { KVIndexConflictError } from "./types.js";
// ============================================================================
// Injectable blob store for malformed data injection
// ============================================================================
class InjectableBlobStore {
    blobs = new Map();
    async get(pathname, _options) {
        const content = this.blobs.get(pathname);
        if (!content)
            return null;
        return {
            stream: new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(content));
                    controller.close();
                },
            }),
            blob: {
                url: `fake://${pathname}`,
                downloadUrl: `fake://${pathname}?download=1`,
                pathname,
                contentType: "application/octet-stream",
                contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
                cacheControl: "public, max-age=31536000, immutable",
                size: content.length,
                uploadedAt: new Date(),
                etag: `"fake-etag-${Date.now()}"`,
            },
            headers: new Headers({
                "content-type": "application/octet-stream",
                "content-length": String(content.length),
            }),
        };
    }
    async put(pathname, body, _options) {
        let content;
        if (body instanceof Buffer) {
            content = body;
        }
        else if (typeof body === "string") {
            content = Buffer.from(body);
        }
        else {
            throw new Error("Unsupported body type in test");
        }
        this.blobs.set(pathname, content);
        return {
            url: `fake://${pathname}`,
            downloadUrl: `fake://${pathname}`,
            pathname,
            contentType: "application/octet-stream",
            contentDisposition: "",
            etag: `"fake-etag-${Date.now()}"`,
        };
    }
    async del(urlOrPathname) {
        const paths = Array.isArray(urlOrPathname)
            ? urlOrPathname
            : [urlOrPathname];
        for (const p of paths) {
            this.blobs.delete(p.replace("fake://", ""));
        }
    }
    async list(_options) {
        return { blobs: [], hasMore: false };
    }
    injectRaw(pathname, content) {
        this.blobs.set(pathname, content);
    }
    clear() {
        this.blobs.clear();
    }
}
const injectableIt = (name, fn) => {
    baseIt(name, fn);
};
const injectableBeforeEach = (fn) => {
    baseBeforeEach(fn);
};
const injectableAfterEach = (fn) => {
    baseAfterEach(fn);
};
describe("Security: MAX_HEADER_SIZE streaming read check", () => {
    injectableBeforeEach((ctx) => {
        ctx.prefix = uniqueTestPrefix();
        ctx.blobStore = new InjectableBlobStore();
        ctx.kv = new KV2({ prefix: ctx.prefix, blobStore: ctx.blobStore });
    });
    injectableAfterEach((ctx) => {
        ctx.blobStore.clear();
    });
    injectableIt("rejects blob with header length exceeding MAX_HEADER_SIZE", async (ctx) => {
        const { kv, blobStore, prefix } = ctx;
        const path = `cached-kv/${prefix}oversized-header.value`;
        // Create a blob whose 4-byte header claims a size larger than MAX_HEADER_SIZE
        const blob = Buffer.alloc(8);
        // MAX_HEADER_SIZE is 100MB (104857600). Write a value larger than that.
        blob.writeUInt32BE(MAX_HEADER_SIZE + 1, 0);
        blobStore.injectRaw(path, blob);
        await expect(kv.get("oversized-header")).rejects.toThrow(/exceeds maximum allowed size/);
    });
    injectableIt("rejects blob with header length at 0xFFFFFFFF", async (ctx) => {
        const { kv, blobStore, prefix } = ctx;
        const path = `cached-kv/${prefix}max-uint32-header.value`;
        const blob = Buffer.alloc(8);
        blob.writeUInt32BE(0xffffffff, 0);
        blobStore.injectRaw(path, blob);
        await expect(kv.get("max-uint32-header")).rejects.toThrow(/exceeds maximum allowed size/);
    });
    injectableIt("accepts blob with header length within MAX_HEADER_SIZE", async (ctx) => {
        const { kv, blobStore, prefix } = ctx;
        const path = `cached-kv/${prefix}ok-header.value`;
        // Create a valid binary format blob with small header
        const header = JSON.stringify({
            metadata: null,
            value: "test",
            encoding: "json",
        });
        const headerBuffer = Buffer.from(header, "utf-8");
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeUInt32BE(headerBuffer.length, 0);
        blobStore.injectRaw(path, Buffer.concat([lengthBuffer, headerBuffer]));
        const result = await kv.get("ok-header");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe("test");
        }
    });
});
// ============================================================================
// 2. Key validation
// ============================================================================
describe("Security: Key validation", () => {
    function createTestKV() {
        const blobStore = new FakeBlobStore();
        const prefix = uniqueTestPrefix();
        const kv = new KV2({ prefix, blobStore });
        return { kv };
    }
    describe("get rejects invalid keys", () => {
        baseIt("rejects empty key", async () => {
            const { kv } = createTestKV();
            await expect(kv.get("")).rejects.toThrow("Key cannot be empty");
        });
        baseIt("rejects key with null byte", async () => {
            const { kv } = createTestKV();
            await expect(kv.get("foo\x00bar")).rejects.toThrow("Key cannot contain null bytes");
        });
        baseIt("rejects key exceeding max length", async () => {
            const { kv } = createTestKV();
            const longKey = "a".repeat(2049);
            await expect(kv.get(longKey)).rejects.toThrow("Key exceeds maximum length");
        });
        baseIt("accepts valid key at max length", async () => {
            const { kv } = createTestKV();
            const key = "a".repeat(2048);
            const result = await kv.get(key);
            expect(result.exists).toBe(false);
        });
    });
    describe("set rejects invalid keys", () => {
        baseIt("rejects empty key", async () => {
            const { kv } = createTestKV();
            await expect(kv.set("", "value")).rejects.toThrow("Key cannot be empty");
        });
        baseIt("rejects key with null byte", async () => {
            const { kv } = createTestKV();
            await expect(kv.set("key\x00null", "value")).rejects.toThrow("Key cannot contain null bytes");
        });
        baseIt("rejects key exceeding max length", async () => {
            const { kv } = createTestKV();
            await expect(kv.set("x".repeat(2049), "value")).rejects.toThrow("Key exceeds maximum length");
        });
    });
    describe("delete rejects invalid keys", () => {
        baseIt("rejects empty key", async () => {
            const { kv } = createTestKV();
            await expect(kv.delete("")).rejects.toThrow("Key cannot be empty");
        });
        baseIt("rejects key with null byte", async () => {
            const { kv } = createTestKV();
            await expect(kv.delete("foo\x00")).rejects.toThrow("Key cannot contain null bytes");
        });
    });
    describe("getValue rejects invalid keys", () => {
        baseIt("rejects empty key", async () => {
            const { kv } = createTestKV();
            await expect(kv.getValue("")).rejects.toThrow("Key cannot be empty");
        });
    });
    describe("accepts keys with special characters", () => {
        baseIt("allows keys with slashes", async () => {
            const { kv } = createTestKV();
            await kv.set("users/alice/profile", { name: "Alice" });
            const result = await kv.get("users/alice/profile");
            expect(result.exists).toBe(true);
        });
        baseIt("allows keys with dots and dashes", async () => {
            const { kv } = createTestKV();
            await kv.set("my-key.v2", "data");
            const result = await kv.get("my-key.v2");
            expect(result.exists).toBe(true);
        });
        baseIt("allows keys with unicode", async () => {
            const { kv } = createTestKV();
            await kv.set("clé-données", "valeur");
            const result = await kv.get("clé-données");
            expect(result.exists).toBe(true);
        });
    });
});
describe("Security: Index key encoding", () => {
    setupTestContext();
    function createUserStore(ctx) {
        return ctx.kv.getStore("users/").withIndexes({
            byRole: { key: (u) => u.role },
            byCategory: { key: (u) => u.category, unique: true },
        });
    }
    it("handles slash in non-unique index value without collision", async (ctx) => {
        const store = createUserStore(ctx);
        // Set entries with index values containing /
        await store.set("user1", { name: "Alice", role: "admin/super", category: "cat-a" }, { createdBy: "test", version: 1 });
        await store.set("user2", { name: "Bob", role: "admin", category: "cat-b" }, { createdBy: "test", version: 1 });
        // Query for "admin/super" should only return user1
        const keys1 = [];
        for await (const k of store.keys({ byRole: "admin/super" })) {
            keys1.push(k);
        }
        expect(keys1).toEqual(["user1"]);
        // Query for "admin" should only return user2
        const keys2 = [];
        for await (const k of store.keys({ byRole: "admin" })) {
            keys2.push(k);
        }
        expect(keys2).toEqual(["user2"]);
    });
    it("handles slash in primary key without collision", async (ctx) => {
        const store = createUserStore(ctx);
        // Primary keys with slashes
        await store.set("org/team/alice", { name: "Alice", role: "admin", category: "cat-a" }, { createdBy: "test", version: 1 });
        await store.set("org/team/bob", { name: "Bob", role: "admin", category: "cat-b" }, { createdBy: "test", version: 1 });
        // Both should be findable by role
        const keys = [];
        for await (const k of store.keys({ byRole: "admin" })) {
            keys.push(k);
        }
        expect(keys.sort()).toEqual(["org/team/alice", "org/team/bob"]);
    });
    it("prevents collision between similar index/pk combinations", async (ctx) => {
        const store = createUserStore(ctx);
        // Without encoding, these would produce the same index key:
        // indexValue="a/b" + pk="c" → "a/b/c"
        // indexValue="a"   + pk="b/c" → "a/b/c"
        await store.set("c", { name: "User1", role: "a/b", category: "cat-1" }, { createdBy: "test", version: 1 });
        await store.set("b/c", { name: "User2", role: "a", category: "cat-2" }, { createdBy: "test", version: 1 });
        // Query for role "a/b" should only return "c"
        const keysAB = [];
        for await (const k of store.keys({ byRole: "a/b" })) {
            keysAB.push(k);
        }
        expect(keysAB).toEqual(["c"]);
        // Query for role "a" should only return "b/c"
        const keysA = [];
        for await (const k of store.keys({ byRole: "a" })) {
            keysA.push(k);
        }
        expect(keysA).toEqual(["b/c"]);
    });
    it("handles percent in index value (double-encoding safety)", async (ctx) => {
        const store = createUserStore(ctx);
        await store.set("user1", { name: "Alice", role: "100%", category: "cat-a" }, { createdBy: "test", version: 1 });
        await store.set("user2", { name: "Bob", role: "100%2F", category: "cat-b" }, { createdBy: "test", version: 1 });
        // These should not collide despite %2F looking like an encoded /
        const keys1 = [];
        for await (const k of store.keys({ byRole: "100%" })) {
            keys1.push(k);
        }
        expect(keys1).toEqual(["user1"]);
        const keys2 = [];
        for await (const k of store.keys({ byRole: "100%2F" })) {
            keys2.push(k);
        }
        expect(keys2).toEqual(["user2"]);
    });
    it("entries query works with slashes in index values", async (ctx) => {
        const store = createUserStore(ctx);
        await store.set("user1", { name: "Alice", role: "dept/eng", category: "cat-a" }, { createdBy: "test", version: 1 });
        const entries = [];
        for await (const [k, entry] of store.entries({ byRole: "dept/eng" })) {
            entries.push([k, await entry.value]);
        }
        expect(entries.length).toBe(1);
        expect(entries[0][0]).toBe("user1");
    });
    it("deletion works correctly with encoded index keys", async (ctx) => {
        const store = createUserStore(ctx);
        await store.set("user1", { name: "Alice", role: "admin/super", category: "cat-a" }, { createdBy: "test", version: 1 });
        // Verify it exists
        const before = [];
        for await (const k of store.keys({ byRole: "admin/super" })) {
            before.push(k);
        }
        expect(before).toEqual(["user1"]);
        // Delete and verify it's gone
        await store.delete("user1");
        const after = [];
        for await (const k of store.keys({ byRole: "admin/super" })) {
            after.push(k);
        }
        expect(after).toEqual([]);
    });
    it("reindex works correctly with slashes in index values", async (ctx) => {
        const store = createUserStore(ctx);
        await store.set("user1", { name: "Alice", role: "admin/level-2", category: "cat-a" }, { createdBy: "test", version: 1 });
        // Reindex and verify query still works
        await store.reindex();
        const keys = [];
        for await (const k of store.keys({ byRole: "admin/level-2" })) {
            keys.push(k);
        }
        expect(keys).toEqual(["user1"]);
    });
});
// ============================================================================
// 4. Unique index CAS protection (TOCTOU defense)
// ============================================================================
describe("Security: Unique index CAS protection", () => {
    setupTestContext();
    it("rejects duplicate unique index value", async (ctx) => {
        const store = ctx.kv
            .getStore("emails/")
            .withIndexes({
            byEmail: { key: (u) => u.email, unique: true },
        });
        await store.set("alice", { email: "alice@test.com" }, { createdBy: "test", version: 1 });
        // Second write with same unique value should fail
        await expect(store.set("bob", { email: "alice@test.com" }, { createdBy: "test", version: 1 })).rejects.toThrow(/Unique index/);
    });
    it("allows updating same key with same unique value", async (ctx) => {
        const store = ctx.kv
            .getStore("emails/")
            .withIndexes({
            byEmail: { key: (u) => u.email, unique: true },
        });
        await store.set("alice", { email: "alice@test.com", name: "Alice" }, { createdBy: "test", version: 1 });
        // Updating the same key with the same unique value should succeed
        await store.set("alice", { email: "alice@test.com", name: "Alice Updated" }, { createdBy: "test", version: 2 });
        const result = await store.getValue("alice");
        expect(result).toBeDefined();
        expect(result?.name).toBe("Alice Updated");
    });
    it("allows changing unique index value on same key", async (ctx) => {
        const store = ctx.kv
            .getStore("emails/")
            .withIndexes({
            byEmail: { key: (u) => u.email, unique: true },
        });
        await store.set("alice", { email: "old@test.com" }, { createdBy: "test", version: 1 });
        // Changing the email should succeed
        await store.set("alice", { email: "new@test.com" }, { createdBy: "test", version: 2 });
        // Old email should not resolve
        const oldResult = await store.get({ byEmail: "old@test.com" });
        expect(oldResult.exists).toBe(false);
        // New email should resolve
        const newResult = await store.get({ byEmail: "new@test.com" });
        expect(newResult.exists).toBe(true);
    });
    it("unique index uses override:false for new entries (CAS)", async (ctx) => {
        // This tests that the override:false protection is in place.
        // We create a store, manually seed an index entry via a raw write,
        // then try to write a new entry with the same unique value.
        const store = ctx.kv
            .getStore("cas/")
            .withIndexes({
            byEmail: { key: (u) => u.email, unique: true },
        });
        // Write alice with email
        await store.set("alice", { email: "shared@test.com" }, { createdBy: "test", version: 1 });
        // Try to write bob with same email — should fail
        const err = await store
            .set("bob", { email: "shared@test.com" }, { createdBy: "test", version: 1 })
            .catch((e) => e);
        expect(err).toBeInstanceOf(KVIndexConflictError);
        expect(err.indexName).toBe("byEmail");
        expect(err.indexKey).toBe("shared@test.com");
    });
});
// ============================================================================
// 5. KVIndexConflictError does not leak index key in message
// ============================================================================
describe("Security: KVIndexConflictError message redaction", () => {
    baseIt("error message does not contain the conflicting index value", async () => {
        const sensitiveEmail = "secret-user@private-domain.com";
        const error = new KVIndexConflictError("byEmail", sensitiveEmail);
        // Message should NOT contain the sensitive value
        expect(error.message).not.toContain(sensitiveEmail);
        expect(error.message).toContain("byEmail");
        expect(error.message).toContain("another entry already uses");
        // But the value should still be accessible programmatically
        expect(error.indexKey).toBe(sensitiveEmail);
        expect(error.indexName).toBe("byEmail");
    });
    baseIt("error name is correct", async () => {
        const error = new KVIndexConflictError("idx", "val");
        expect(error.name).toBe("KVIndexConflictError");
    });
    setupTestContext();
    it("thrown error from store does not leak index value", async (ctx) => {
        const store = ctx.kv
            .getStore("leak/")
            .withIndexes({
            byEmail: { key: (u) => u.email, unique: true },
        });
        const sensitiveEmail = "user@sensitive-internal.corp";
        await store.set("alice", { email: sensitiveEmail }, { createdBy: "test", version: 1 });
        try {
            await store.set("bob", { email: sensitiveEmail }, { createdBy: "test", version: 1 });
            // Should not reach here
            expect(true).toBe(false);
        }
        catch (e) {
            expect(e).toBeInstanceOf(KVIndexConflictError);
            const err = e;
            // Message should not contain the sensitive email
            expect(err.message).not.toContain(sensitiveEmail);
            // But programmatic access should work
            expect(err.indexKey).toBe(sensitiveEmail);
        }
    });
});
//# sourceMappingURL=security.test.js.map