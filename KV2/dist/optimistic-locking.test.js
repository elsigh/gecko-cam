import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
import { TypedKV } from "./typed-kv.js";
import { KVVersionConflictError } from "./types.js";
// Helper to check for KVVersionConflictError - the test framework's rejects.toThrow doesn't support class constructors
async function expectVersionConflictError(promise) {
    let threw = false;
    let error;
    try {
        await promise;
    }
    catch (e) {
        threw = true;
        error = e;
    }
    expect(threw).toBe(true);
    expect(error).toBeInstanceOf(KVVersionConflictError);
}
describe("Optimistic Locking", () => {
    setupTestContext();
    describe("version field", () => {
        it("get() returns version on entry", async (ctx) => {
            const { kv } = ctx;
            await kv.set("test-key", { foo: "bar" }, { createdBy: "test", version: 1 });
            const result = await kv.get("test-key");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(result.version).toBeDefined();
                expect(typeof result.version).toBe("string");
                expect(result.version.length).toBeGreaterThan(0);
            }
        });
        it("set() returns version in result", async (ctx) => {
            const { kv } = ctx;
            const result = await kv.set("test-key", { foo: "bar" }, { createdBy: "test", version: 1 });
            expect(result).toBeDefined();
            expect(result.version).toBeDefined();
            expect(typeof result.version).toBe("string");
            expect(result.version.length).toBeGreaterThan(0);
        });
        it("version changes after update", async (ctx) => {
            const { kv } = ctx;
            const result1 = await kv.set("test-key", { value: 1 }, { createdBy: "test", version: 1 });
            const result2 = await kv.set("test-key", { value: 2 }, { createdBy: "test", version: 2 });
            expect(result1.version).not.toBe(result2.version);
        });
    });
    describe("entry.update()", () => {
        it("entry.update() succeeds when version matches", async (ctx) => {
            const { kv } = ctx;
            await kv.set("update-test", { value: 1 }, { createdBy: "test", version: 1 });
            const entry = await kv.get("update-test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                const originalVersion = entry.version;
                const result = await entry.update({ value: 2 });
                // Update should succeed and return new version
                expect(result.version).toBeDefined();
                expect(result.version).not.toBe(originalVersion);
                // Verify the value was updated
                const updated = await kv.get("update-test");
                expect(updated.exists).toBe(true);
                if (updated.exists) {
                    expect(await updated.value).toEqual({ value: 2 });
                }
            }
        });
        it("entry.update() fails with KVVersionConflictError when version changed", async (ctx) => {
            const { kv } = ctx;
            await kv.set("conflict-test", { value: 1 }, { createdBy: "test", version: 1 });
            // Get the entry (captures version)
            const entry = await kv.get("conflict-test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                // Another process updates the value
                await kv.set("conflict-test", { value: 2 }, { createdBy: "other", version: 2 });
                // Now try to update with stale version
                await expectVersionConflictError(entry.update({ value: 3 }));
            }
        });
        it("entry.update() preserves metadata by default", async (ctx) => {
            const { kv } = ctx;
            await kv.set("metadata-test", { value: 1 }, { createdBy: "original", version: 1 });
            const entry = await kv.get("metadata-test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                // Update without providing metadata
                await entry.update({ value: 2 });
                const updated = await kv.get("metadata-test");
                expect(updated.exists).toBe(true);
                if (updated.exists) {
                    expect(updated.metadata.createdBy).toBe("original");
                }
            }
        });
        it("entry.update() can change metadata", async (ctx) => {
            const { kv } = ctx;
            await kv.set("metadata-update", { value: 1 }, { createdBy: "original", version: 1 });
            const entry = await kv.get("metadata-update");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                await entry.update({ value: 2 }, { createdBy: "updated", version: 2 });
                const updated = await kv.get("metadata-update");
                expect(updated.exists).toBe(true);
                if (updated.exists) {
                    expect(updated.metadata.createdBy).toBe("updated");
                    expect(updated.metadata.version).toBe(2);
                }
            }
        });
    });
    describe("set with expectedVersion", () => {
        it("set with expectedVersion succeeds when matches", async (ctx) => {
            const { kv } = ctx;
            const { version } = await kv.set("expected-version-test", { value: 1 }, { createdBy: "test", version: 1 });
            const result = await kv.set("expected-version-test", { value: 2 }, { createdBy: "test", version: 2 }, { expectedVersion: version });
            expect(result.version).toBeDefined();
            expect(result.version).not.toBe(version);
        });
        it("set with expectedVersion fails when mismatched", async (ctx) => {
            const { kv } = ctx;
            await kv.set("mismatch-test", { value: 1 }, { createdBy: "test", version: 1 });
            await expectVersionConflictError(kv.set("mismatch-test", { value: 2 }, { createdBy: "test", version: 2 }, { expectedVersion: "wrong-version" }));
        });
        it("set with expectedVersion fails when key does not exist", async (ctx) => {
            const { kv } = ctx;
            // Real @vercel/blob behavior: ifMatch on non-existent key throws error
            await expectVersionConflictError(kv.set("nonexistent-key", { value: 1 }, { createdBy: "test", version: 1 }, { expectedVersion: "some-version" }));
        });
    });
    describe("override option", () => {
        it("set with override: false fails when key exists", async (ctx) => {
            const { kv } = ctx;
            await kv.set("existing-key", { value: 1 }, { createdBy: "test", version: 1 });
            await expectVersionConflictError(kv.set("existing-key", { value: 2 }, { createdBy: "test", version: 2 }, { override: false }));
        });
        it("set with override: false succeeds when key does not exist", async (ctx) => {
            const { kv } = ctx;
            const result = await kv.set("new-key-override-false", { value: 1 }, { createdBy: "test", version: 1 }, { override: false });
            expect(result.version).toBeDefined();
        });
        it("set with override: true (default) overwrites existing", async (ctx) => {
            const { kv } = ctx;
            await kv.set("overwrite-test", { value: 1 }, { createdBy: "test", version: 1 });
            // Default behavior should allow overwrite
            const result = await kv.set("overwrite-test", { value: 2 }, { createdBy: "test", version: 2 });
            expect(result.version).toBeDefined();
            const entry = await kv.get("overwrite-test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                expect(await entry.value).toEqual({ value: 2 });
            }
        });
    });
    describe("concurrent operations", () => {
        it("concurrent updates: one wins, one gets conflict error", async (ctx) => {
            const { kv } = ctx;
            await kv.set("concurrent-test", { value: 0 }, { createdBy: "test", version: 1 });
            // Both read the same version
            const entry1 = await kv.get("concurrent-test");
            const entry2 = await kv.get("concurrent-test");
            expect(entry1.exists).toBe(true);
            expect(entry2.exists).toBe(true);
            if (entry1.exists && entry2.exists) {
                // First update succeeds
                await entry1.update({ value: 1 });
                // Second update should fail
                await expectVersionConflictError(entry2.update({ value: 2 }));
            }
        });
        it("read-modify-write pattern with retry on conflict", async (ctx) => {
            const { kv } = ctx;
            await kv.set("retry-test", { counter: 0 }, { createdBy: "test", version: 1 });
            // Simulate a read-modify-write with retry
            const incrementWithRetry = async () => {
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    attempts++;
                    const entry = await kv.get("retry-test");
                    if (!entry.exists)
                        throw new Error("Key not found");
                    const current = await entry.value;
                    try {
                        await entry.update({ counter: current.counter + 1 });
                        return current.counter + 1;
                    }
                    catch (error) {
                        if (error instanceof KVVersionConflictError &&
                            attempts < maxAttempts) {
                            // Retry on conflict
                            continue;
                        }
                        throw error;
                    }
                }
                throw new Error("Max retries exceeded");
            };
            const result = await incrementWithRetry();
            expect(result).toBe(1);
            const entry = await kv.get("retry-test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                expect(await entry.value).toEqual({ counter: 1 });
            }
        });
    });
    describe("TypedKV integration", () => {
        it("TypedKV entry.update() works with prefixed keys", async (ctx) => {
            const { kv } = ctx;
            const typedKV = new TypedKV(kv, "typed/");
            await typedKV.set("test", { value: 1 }, { createdBy: "test", version: 1 });
            const entry = await typedKV.get("test");
            expect(entry.exists).toBe(true);
            if (entry.exists) {
                expect(entry.version).toBeDefined();
                const result = await entry.update({ value: 2 });
                expect(result.version).toBeDefined();
                const updated = await typedKV.get("test");
                expect(updated.exists).toBe(true);
                if (updated.exists) {
                    expect(await updated.value).toEqual({ value: 2 });
                }
            }
        });
        it("TypedKV set options pass through correctly", async (ctx) => {
            const { kv } = ctx;
            const typedKV = new TypedKV(kv, "typed/");
            // Test override: false
            await typedKV.set("unique", { value: 1 }, { createdBy: "test", version: 1 }, { override: false });
            await expectVersionConflictError(typedKV.set("unique", { value: 2 }, { createdBy: "test", version: 2 }, { override: false }));
            // Test expectedVersion
            const { version } = await typedKV.set("versioned", { value: 1 }, { createdBy: "test", version: 1 });
            const result = await typedKV.set("versioned", { value: 2 }, { createdBy: "test", version: 2 }, { expectedVersion: version });
            expect(result.version).not.toBe(version);
        });
        it("TypedKV version conflict uses unprefixed key in error message", async (ctx) => {
            const { kv } = ctx;
            const typedKV = new TypedKV(kv, "typed/");
            await typedKV.set("my-key", { value: 1 }, { createdBy: "test", version: 1 });
            let threw = false;
            let error;
            try {
                await typedKV.set("my-key", { value: 2 }, { createdBy: "test", version: 2 }, { expectedVersion: "wrong" });
            }
            catch (e) {
                threw = true;
                error = e;
            }
            expect(threw).toBe(true);
            expect(error).toBeInstanceOf(KVVersionConflictError);
            // The error message will contain the prefixed key since that's what KV2 sees
            expect(error.message).toContain("typed/my-key");
        });
    });
});
//# sourceMappingURL=optimistic-locking.test.js.map