import { KV2 } from "../cached-kv.js";
import type { KV2Options } from "../types.js";
import { FakeBlobStore } from "./fake-blob-store.js";
import { type TestContext as BaseTestContext } from "./vitest-compat.js";
export interface TestMetadata {
    createdBy: string;
    version: number;
}
/** Context available to each test */
export interface KVTestContext extends BaseTestContext {
    kv: KV2<TestMetadata>;
    blobStore: FakeBlobStore | undefined;
    cleanup: () => Promise<void>;
    isReal: boolean;
}
/**
 * Sets up a test context with beforeAll/afterAll/beforeEach/afterEach hooks.
 * Uses the test context system for concurrent-safe test execution.
 *
 * Each test gets its own isolated FakeBlobStore (for unit tests) or
 * unique prefix (for integration tests) to enable concurrent execution.
 */
export declare function setupTestContext(options?: Partial<KV2Options>): void;
export { createTestKV, uniqueTestPrefix, useRealBlobStore } from "./index.js";
export type { PrefixString } from "../types.js";
/** Typed test function that receives KVTestContext */
type TypedTestFn = (ctx: KVTestContext) => Promise<void> | void;
/** Typed `it` that provides KVTestContext to tests */
export declare const it: (name: string, fn: TypedTestFn) => void;
/** Typed `test` that provides KVTestContext to tests (alias for `it`) */
export declare const test: (name: string, fn: TypedTestFn) => void;
//# sourceMappingURL=test-setup.d.ts.map