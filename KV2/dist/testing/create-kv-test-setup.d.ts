import { FakeBlobStore } from "./fake-blob-store.js";
import { FakeCache } from "./fake-cache.js";
import { type TestContext as BaseTestContext } from "./vitest-compat.js";
/** Context available to each createKV test */
export interface CreateKVTestContext extends BaseTestContext {
    blobStore: FakeBlobStore;
    cache: FakeCache;
    originalEnv: NodeJS.ProcessEnv;
}
/**
 * Sets up a createKV test context.
 * Each test gets its own isolated FakeBlobStore and FakeCache.
 * Environment variables are restored after each test.
 */
export declare function setupCreateKVTestContext(): void;
/** Typed test function that receives CreateKVTestContext */
type TypedTestFn = (ctx: CreateKVTestContext) => Promise<void> | void;
/** Typed `it` that provides CreateKVTestContext to tests */
export declare const it: (name: string, fn: TypedTestFn) => void;
export {};
//# sourceMappingURL=create-kv-test-setup.d.ts.map