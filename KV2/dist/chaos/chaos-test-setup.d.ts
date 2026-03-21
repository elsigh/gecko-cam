import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { type TestContext as BaseTestContext } from "../testing/vitest-compat.js";
import type { PrefixString } from "../types.js";
export interface TestMetadata {
    createdBy: string;
    version: number;
}
/** Context available to each chaos test */
export interface ChaosTestContext extends BaseTestContext {
    blobStore: FakeBlobStore;
    kv: KV2<TestMetadata>;
    prefix: PrefixString;
}
/** Typed test function that receives ChaosTestContext */
type TypedTestFn = (ctx: ChaosTestContext) => Promise<void> | void;
type TypedHookFn = (ctx: ChaosTestContext) => Promise<void> | void;
/** Typed `it` that provides ChaosTestContext to tests */
export declare const it: (name: string, fn: TypedTestFn) => void;
/** Typed `beforeEach` that provides ChaosTestContext */
export declare const beforeEach: (fn: TypedHookFn) => void;
/** Typed `afterEach` that provides ChaosTestContext */
export declare const afterEach: (fn: TypedHookFn) => void;
/**
 * Sets up standard chaos test context with FakeBlobStore and KV2.
 * Each test gets its own isolated instances.
 */
export declare function setupChaosContext(): void;
export { uniqueTestPrefix } from "../testing/index.js";
export { KV2 } from "../cached-kv.js";
export { FakeBlobStore } from "../testing/fake-blob-store.js";
export type { PrefixString } from "../types.js";
//# sourceMappingURL=chaos-test-setup.d.ts.map