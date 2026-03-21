import * as fs from "node:fs";
import * as path from "node:path";
import { KV2 } from "./cached-kv.js";
import { createKV } from "./create-kv.js";
import { it, setupCreateKVTestContext, } from "./testing/create-kv-test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
describe("createKV", () => {
    setupCreateKVTestContext();
    describe("environment detection", () => {
        it("uses VERCEL_ENV and VERCEL_GIT_COMMIT_REF", ({ blobStore, cache }) => {
            process.env.VERCEL_ENV = "preview";
            process.env.VERCEL_GIT_COMMIT_REF = "feature-branch";
            const kv = createKV({ blobStore, cache });
            expect(kv).toBeInstanceOf(KV2);
        });
        it("defaults to development/main when env vars missing", ({ blobStore, cache, }) => {
            // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
            delete process.env.VERCEL_ENV;
            // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
            delete process.env.VERCEL_GIT_COMMIT_REF;
            const kv = createKV({ blobStore, cache });
            expect(kv).toBeInstanceOf(KV2);
        });
        it("respects explicit env/branch options", ({ blobStore, cache }) => {
            process.env.VERCEL_ENV = "production";
            process.env.VERCEL_GIT_COMMIT_REF = "main";
            const kv = createKV({
                env: "preview",
                branch: "feature",
                blobStore,
                cache,
            });
            expect(kv).toBeInstanceOf(KV2);
        });
    });
    describe("branch encoding", () => {
        it("encodes slashes in branch names", async ({ blobStore, cache }) => {
            const kv = createKV({
                env: "preview",
                branch: "feature/my-feature",
                blobStore,
                cache,
            });
            await kv.set("test", "value");
            // Check that the blob was created with encoded branch
            const blobs = await blobStore.list({ prefix: "cached-kv/preview/" });
            const hasEncodedBranch = blobs.blobs.some((b) => b.pathname.includes("feature%2Fmy-feature"));
            expect(hasEncodedBranch).toBe(true);
        });
        it("lowercases branch names", async ({ blobStore, cache }) => {
            const kv = createKV({
                env: "preview",
                branch: "Feature-Branch",
                blobStore,
                cache,
            });
            await kv.set("test", "value");
            const blobs = await blobStore.list({ prefix: "cached-kv/preview/" });
            const hasLowercaseBranch = blobs.blobs.some((b) => b.pathname.includes("feature-branch"));
            expect(hasLowercaseBranch).toBe(true);
        });
    });
    describe("long branch names", () => {
        it("truncates branch name and adds hash suffix for >64 chars", async ({ blobStore, cache, }) => {
            const longBranch = "a".repeat(100);
            const kv = createKV({
                env: "preview",
                branch: longBranch,
                blobStore,
                cache,
            });
            await kv.set("test", "value");
            const blobs = await blobStore.list({ prefix: "cached-kv/preview/" });
            expect(blobs.blobs.length).toBeGreaterThan(0);
            // Branch should be truncated + hash suffix (55 chars + '-' + 8 char hash)
            const blobPath = blobs.blobs[0].pathname;
            const branchPart = blobPath.split("/")[2]; // cached-kv/preview/{branch}/...
            expect(branchPart.length).toBe(64); // 55 + 1 + 8
            expect(branchPart).toContain("-"); // Has hash separator
        });
    });
    describe("user prefix", () => {
        it("includes user prefix in path", async ({ blobStore, cache }) => {
            const kv = createKV({
                env: "production",
                branch: "main",
                prefix: "myapp/",
                blobStore,
                cache,
            });
            await kv.set("test", "value");
            const blobs = await blobStore.list({
                prefix: "cached-kv/production/main/myapp/",
            });
            expect(blobs.blobs.length).toBeGreaterThan(0);
        });
    });
    describe("type safety", () => {
        it("KV2 has common methods", async ({ blobStore, cache }) => {
            process.env.VERCEL_ENV = "production";
            process.env.VERCEL_GIT_COMMIT_REF = "main";
            const kv = createKV({ blobStore, cache });
            // These should compile and work
            await kv.set("key", "value");
            await kv.get("key");
            await kv.delete("key");
            for await (const _ of kv.keys()) {
                // iteration works
            }
        });
    });
    describe("local dev fallback", () => {
        it("falls back to DiskBlobStore when no token and not on Vercel", async ({ originalEnv, }) => {
            // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
            delete process.env.BLOB_READ_WRITE_TOKEN;
            // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
            delete process.env.VERCEL;
            const kv = createKV({ env: "development", branch: "main" });
            // Should work — set/get roundtrip
            await kv.set("hello", "world");
            const result = await kv.get("hello");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toBe("world");
            }
            // Clean up disk storage
            const cacheDir = path.join(process.cwd(), "node_modules", ".cache", "@vercel", "kv2");
            fs.rmSync(cacheDir, { recursive: true, force: true });
        });
        it("throws when no token on Vercel", ({ originalEnv }) => {
            // biome-ignore lint/performance/noDelete: process.env coerces undefined to string "undefined"
            delete process.env.BLOB_READ_WRITE_TOKEN;
            process.env.VERCEL = "1";
            let threw = false;
            try {
                createKV({ env: "production", branch: "main" });
            }
            catch (e) {
                threw = true;
                expect(e.message).toContain("Missing BLOB_READ_WRITE_TOKEN");
            }
            expect(threw).toBe(true);
        });
    });
});
//# sourceMappingURL=create-kv.test.js.map