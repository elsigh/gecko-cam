import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "./fake-blob-store.js";
import { createTestKV, uniqueTestPrefix, useRealBlobStore } from "./index.js";
import { afterAll, afterEach, it as baseIt, beforeAll, beforeEach, } from "./vitest-compat.js";
/** Suite-level cleanup functions (not copied to test context) */
const suiteCleanupFns = new Map();
/**
 * Sets up a test context with beforeAll/afterAll/beforeEach/afterEach hooks.
 * Uses the test context system for concurrent-safe test execution.
 *
 * Each test gets its own isolated FakeBlobStore (for unit tests) or
 * unique prefix (for integration tests) to enable concurrent execution.
 */
export function setupTestContext(options) {
    // Use a unique key for this suite's cleanup functions
    const suiteKey = Math.random().toString(36).slice(2);
    beforeAll(() => {
        suiteCleanupFns.set(suiteKey, []);
        if (useRealBlobStore()) {
            console.log("Running tests against REAL blob store");
        }
    });
    beforeEach((ctx) => {
        const testCtx = ctx;
        if (useRealBlobStore()) {
            // For real blob store, each test gets its own unique prefix
            const result = createTestKV(options);
            testCtx.kv = result.kv;
            testCtx.blobStore = undefined;
            testCtx.cleanup = result.cleanup;
            testCtx.isReal = true;
            // Track cleanup for afterAll (thread-safe push)
            suiteCleanupFns.get(suiteKey)?.push(result.cleanup);
        }
        else {
            // For unit tests, each test gets its own FakeBlobStore for isolation
            const blobStore = new FakeBlobStore();
            const prefix = options?.prefix ?? uniqueTestPrefix();
            testCtx.kv = new KV2({
                ...options,
                prefix,
                blobStore,
            });
            testCtx.blobStore = blobStore;
            testCtx.cleanup = async () => blobStore.clear();
            testCtx.isReal = false;
        }
    });
    afterEach((ctx) => {
        const testCtx = ctx;
        // Clear the blob store after each test
        if (testCtx.blobStore) {
            testCtx.blobStore.clear();
        }
    });
    afterAll(async () => {
        // Clean up all real blob store prefixes created during tests
        const cleanups = suiteCleanupFns.get(suiteKey) ?? [];
        for (const cleanup of cleanups) {
            await cleanup();
        }
        suiteCleanupFns.delete(suiteKey);
    });
}
export { createTestKV, uniqueTestPrefix, useRealBlobStore } from "./index.js";
/** Typed `it` that provides KVTestContext to tests */
export const it = (name, fn) => {
    baseIt(name, fn);
};
/** Typed `test` that provides KVTestContext to tests (alias for `it`) */
export const test = it;
//# sourceMappingURL=test-setup.js.map