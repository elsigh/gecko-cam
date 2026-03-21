import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { uniqueTestPrefix } from "../testing/index.js";
import { afterEach as baseAfterEach, beforeEach as baseBeforeEach, it as baseIt, } from "../testing/vitest-compat.js";
/** Typed `it` that provides ChaosTestContext to tests */
export const it = (name, fn) => {
    baseIt(name, fn);
};
/** Typed `beforeEach` that provides ChaosTestContext */
export const beforeEach = (fn) => {
    baseBeforeEach(fn);
};
/** Typed `afterEach` that provides ChaosTestContext */
export const afterEach = (fn) => {
    baseAfterEach(fn);
};
/**
 * Sets up standard chaos test context with FakeBlobStore and KV2.
 * Each test gets its own isolated instances.
 */
export function setupChaosContext() {
    beforeEach((ctx) => {
        ctx.prefix = uniqueTestPrefix();
        ctx.blobStore = new FakeBlobStore();
        ctx.kv = new KV2({
            prefix: ctx.prefix,
            blobStore: ctx.blobStore,
        });
    });
    afterEach((ctx) => {
        ctx.blobStore.clear();
    });
}
export { uniqueTestPrefix } from "../testing/index.js";
export { KV2 } from "../cached-kv.js";
export { FakeBlobStore } from "../testing/fake-blob-store.js";
//# sourceMappingURL=chaos-test-setup.js.map