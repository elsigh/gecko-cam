import { KV2 } from "../cached-kv.js";
import type { BlobStore, KV2Options, PrefixString, Tracer } from "../types.js";
export { FakeBlobStore } from "./fake-blob-store.js";
export { FakeCache } from "./fake-cache.js";
export { runTests, resetTestState, getRegisteredTests, type TestResult, type RunResult, type RunTestsOptions, } from "./vitest-compat.js";
/** Get the shared stats tracer for integration tests */
export declare function getStatsTracer(): Tracer;
/** Print timing statistics summary */
export declare function printTimingStats(): void;
/** Clear timing statistics */
export declare function clearTimingStats(): void;
/** Get timing statistics for a specific operation or overall */
export declare function getTimingStats(operation?: string): import("../tracing.js").TimingStats | null;
/** Whether to use real blob store (set INTEGRATION_TEST=1) */
export declare function useRealBlobStore(): boolean;
/**
 * Validate environment for integration tests.
 * Throws if required env vars are missing.
 */
export declare function validateIntegrationTestEnv(): void;
export interface TestKVResult<M> {
    kv: KV2<M>;
    blobStore: BlobStore;
    isReal: boolean;
    cleanup: () => Promise<void>;
}
/**
 * Creates a KV2 for testing.
 * Uses fake blob store by default, or real blob store if INTEGRATION_TEST=1.
 */
export declare function createTestKV<M = Record<string, unknown>>(options?: Partial<KV2Options>): TestKVResult<M>;
export declare function uniqueTestPrefix(): PrefixString;
export declare function cleanupTestBlobs(prefix: string, blobStore?: BlobStore): Promise<void>;
//# sourceMappingURL=index.d.ts.map