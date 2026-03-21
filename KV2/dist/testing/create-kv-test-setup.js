import { FakeBlobStore } from "./fake-blob-store.js";
import { FakeCache } from "./fake-cache.js";
import { afterEach, it as baseIt, beforeEach, } from "./vitest-compat.js";
/**
 * Sets up a createKV test context.
 * Each test gets its own isolated FakeBlobStore and FakeCache.
 * Environment variables are restored after each test.
 */
export function setupCreateKVTestContext() {
    beforeEach((ctx) => {
        const testCtx = ctx;
        testCtx.blobStore = new FakeBlobStore();
        testCtx.cache = new FakeCache();
        testCtx.originalEnv = { ...process.env };
    });
    afterEach((ctx) => {
        const testCtx = ctx;
        process.env = testCtx.originalEnv;
    });
}
/** Typed `it` that provides CreateKVTestContext to tests */
export const it = (name, fn) => {
    baseIt(name, fn);
};
//# sourceMappingURL=create-kv-test-setup.js.map