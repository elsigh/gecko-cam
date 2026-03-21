import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { describe, expect, it } from "../testing/vitest-compat.js";
import { DiskBlobStore } from "./disk-blob-store.js";
function createTmpDir() {
    return path.join(os.tmpdir(), `disk-blob-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}
describe("DiskBlobStore", () => {
    describe("basic operations", () => {
        it("put and get a value", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                const putResult = await store.put("key1", "hello", {
                    access: "private",
                });
                expect(putResult.etag).toBeTruthy();
                expect(putResult.pathname).toBe("key1");
                const getResult = await store.get("key1", { access: "private" });
                expect(getResult).not.toBeNull();
                const result = getResult;
                expect(result.blob.etag).toBe(putResult.etag);
                expect(result.blob.size).toBe(5);
                // Read stream
                const reader = result.stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    chunks.push(value);
                }
                const content = Buffer.concat(chunks).toString("utf-8");
                expect(content).toBe("hello");
            }
            finally {
                await store.clear();
            }
        });
        it("returns null for missing key", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                const result = await store.get("nonexistent", { access: "private" });
                expect(result).toBeNull();
            }
            finally {
                await store.clear();
            }
        });
        it("delete removes the value", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("key1", "hello", { access: "private" });
                await store.del("key1");
                const result = await store.get("key1", { access: "private" });
                expect(result).toBeNull();
            }
            finally {
                await store.clear();
            }
        });
        it("delete is idempotent for missing keys", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            // Should not throw
            await store.del("nonexistent");
            await store.clear();
        });
        it("handles nested pathnames", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("a/b/c/key", "nested", { access: "private" });
                const result = await store.get("a/b/c/key", { access: "private" });
                expect(result).not.toBeNull();
            }
            finally {
                await store.clear();
            }
        });
        it("put with Buffer body", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("buf", Buffer.from("binary data"), {
                    access: "private",
                });
                const content = await store.getContent("buf");
                expect(content?.toString("utf-8")).toBe("binary data");
            }
            finally {
                await store.clear();
            }
        });
    });
    describe("list", () => {
        it("lists all blobs", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("a", "1", { access: "private" });
                await store.put("b", "2", { access: "private" });
                await store.put("c", "3", { access: "private" });
                const result = await store.list();
                expect(result.blobs.length).toBe(3);
                expect(result.blobs.map((b) => b.pathname)).toEqual(["a", "b", "c"]);
                expect(result.hasMore).toBe(false);
            }
            finally {
                await store.clear();
            }
        });
        it("filters by prefix", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("users/1", "a", { access: "private" });
                await store.put("users/2", "b", { access: "private" });
                await store.put("posts/1", "c", { access: "private" });
                const result = await store.list({ prefix: "users/" });
                expect(result.blobs.length).toBe(2);
                expect(result.blobs.every((b) => b.pathname.startsWith("users/"))).toBe(true);
            }
            finally {
                await store.clear();
            }
        });
        it("paginates with limit and cursor", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("a", "1", { access: "private" });
                await store.put("b", "2", { access: "private" });
                await store.put("c", "3", { access: "private" });
                const page1 = await store.list({ limit: 2 });
                expect(page1.blobs.length).toBe(2);
                expect(page1.hasMore).toBe(true);
                expect(page1.cursor).toBeDefined();
                const page2 = await store.list({ limit: 2, cursor: page1.cursor });
                expect(page2.blobs.length).toBe(1);
                expect(page2.hasMore).toBe(false);
            }
            finally {
                await store.clear();
            }
        });
    });
    describe("allowOverwrite: false", () => {
        it("allows first write", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                const result = await store.put("key", "value", {
                    access: "private",
                    allowOverwrite: false,
                });
                expect(result.etag).toBeTruthy();
            }
            finally {
                await store.clear();
            }
        });
        it("rejects second write to same key", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("key", "value", {
                    access: "private",
                    allowOverwrite: false,
                });
                let threw = false;
                try {
                    await store.put("key", "value2", {
                        access: "private",
                        allowOverwrite: false,
                    });
                }
                catch (e) {
                    threw = true;
                    expect(e).toBeInstanceOf(BlobPreconditionFailedError);
                }
                expect(threw).toBe(true);
            }
            finally {
                await store.clear();
            }
        });
    });
    describe("ifMatch (etag enforcement)", () => {
        it("succeeds when etag matches", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                const first = await store.put("key", "value", { access: "private" });
                const result = await store.put("key", "updated", {
                    access: "private",
                    ifMatch: first.etag,
                });
                expect(result.etag).not.toBe(first.etag);
            }
            finally {
                await store.clear();
            }
        });
        it("rejects when etag does not match", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("key", "value", { access: "private" });
                let threw = false;
                try {
                    await store.put("key", "updated", {
                        access: "private",
                        ifMatch: '"wrong-etag"',
                    });
                }
                catch (e) {
                    threw = true;
                    expect(e).toBeInstanceOf(BlobPreconditionFailedError);
                }
                expect(threw).toBe(true);
            }
            finally {
                await store.clear();
            }
        });
    });
    describe("test helpers", () => {
        it("has() checks existence", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                expect(await store.has("key")).toBe(false);
                await store.put("key", "value", { access: "private" });
                expect(await store.has("key")).toBe(true);
            }
            finally {
                await store.clear();
            }
        });
        it("getContent() returns buffer", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("key", "hello", { access: "private" });
                const content = await store.getContent("key");
                expect(content?.toString("utf-8")).toBe("hello");
            }
            finally {
                await store.clear();
            }
        });
        it("getContent() returns undefined for missing", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            const content = await store.getContent("missing");
            expect(content).toBeUndefined();
            await store.clear();
        });
        it("clear() removes directory", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            await store.put("key", "value", { access: "private" });
            await store.clear();
            let exists = true;
            try {
                await fs.access(dir);
            }
            catch {
                exists = false;
            }
            expect(exists).toBe(false);
        });
    });
    describe("del with url prefix", () => {
        it("strips disk:// prefix", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("key", "value", { access: "private" });
                await store.del("disk://key");
                const result = await store.get("key", { access: "private" });
                expect(result).toBeNull();
            }
            finally {
                await store.clear();
            }
        });
        it("handles array of paths", async () => {
            const dir = createTmpDir();
            const store = new DiskBlobStore(dir);
            try {
                await store.put("a", "1", { access: "private" });
                await store.put("b", "2", { access: "private" });
                await store.del(["a", "b"]);
                expect(await store.has("a")).toBe(false);
                expect(await store.has("b")).toBe(false);
            }
            finally {
                await store.clear();
            }
        });
    });
});
//# sourceMappingURL=disk-blob-store.test.js.map