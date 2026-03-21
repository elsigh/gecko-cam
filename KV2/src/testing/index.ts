import { VercelBlobStore } from "../blob-store.js";
import { KV2 } from "../cached-kv.js";
import { createStatsTracer } from "../tracing.js";
import type { BlobStore, KV2Options, PrefixString, Tracer } from "../types.js";
import { FakeBlobStore } from "./fake-blob-store.js";

export { FakeBlobStore } from "./fake-blob-store.js";
export { FakeCache } from "./fake-cache.js";

// Test runner exports
export {
  runTests,
  resetTestState,
  getRegisteredTests,
  type TestResult,
  type RunResult,
  type RunTestsOptions,
} from "./vitest-compat.js";

// Shared stats tracer for integration tests
const statsTracer = createStatsTracer();

/** Get the shared stats tracer for integration tests */
export function getStatsTracer(): Tracer {
  return statsTracer.tracer;
}

/** Print timing statistics summary */
export function printTimingStats(): void {
  statsTracer.printStats();
}

/** Clear timing statistics */
export function clearTimingStats(): void {
  statsTracer.clear();
}

/** Get timing statistics for a specific operation or overall */
export function getTimingStats(operation?: string) {
  return statsTracer.getStats(operation);
}

/** Whether to use real blob store (set INTEGRATION_TEST=1) */
export function useRealBlobStore(): boolean {
  return process.env.INTEGRATION_TEST === "1";
}

/**
 * Validate environment for integration tests.
 * Throws if required env vars are missing.
 */
export function validateIntegrationTestEnv(): void {
  if (process.env.INTEGRATION_TEST !== "1") {
    return; // Not running integration tests, no validation needed
  }

  const missing: string[] = [];

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    missing.push("BLOB_READ_WRITE_TOKEN");
  }

  if (!process.env.PROTECTION_BYPASS) {
    missing.push("PROTECTION_BYPASS");
  }

  if (missing.length > 0) {
    throw new Error(
      `Integration tests require these environment variables: ${missing.join(", ")}\nSet them in .env.local or export them before running tests.`,
    );
  }
}
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
export function createTestKV<M = Record<string, unknown>>(
  options: Partial<KV2Options> = {},
): TestKVResult<M> {
  const prefix = options.prefix ?? uniqueTestPrefix();

  if (useRealBlobStore()) {
    // Env validation happens at test startup via validateIntegrationTestEnv()
    const blobStore = new VercelBlobStore();
    const kv = new KV2<M>({
      ...options,
      prefix,
      blobStore,
      tracer: statsTracer.tracer,
    });
    return {
      kv,
      blobStore,
      isReal: true,
      cleanup: () => cleanupTestBlobs(prefix, blobStore),
    };
  }

  const blobStore = new FakeBlobStore();
  const kv = new KV2<M>({
    ...options,
    prefix,
    blobStore,
  });
  return {
    kv,
    blobStore,
    isReal: false,
    cleanup: async () => blobStore.clear(),
  };
}

export function uniqueTestPrefix(): PrefixString {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `test-${timestamp}-${random}/`;
}

export async function cleanupTestBlobs(
  prefix: string,
  blobStore?: BlobStore,
): Promise<void> {
  const store = blobStore ?? new VercelBlobStore();
  let cursor: string | undefined;

  do {
    const result = await store.list({ prefix: `cached-kv/${prefix}`, cursor });
    if (result.blobs.length > 0) {
      await store.del(result.blobs.map((b) => b.pathname));
    }
    cursor = result.cursor;
  } while (cursor);
}
