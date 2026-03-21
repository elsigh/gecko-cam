import { FakeBlobStore } from "./fake-blob-store.js";
import { FakeCache } from "./fake-cache.js";
import {
  type TestContext as BaseTestContext,
  afterEach,
  it as baseIt,
  beforeEach,
} from "./vitest-compat.js";

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
export function setupCreateKVTestContext(): void {
  beforeEach((ctx) => {
    const testCtx = ctx as CreateKVTestContext;
    testCtx.blobStore = new FakeBlobStore();
    testCtx.cache = new FakeCache();
    testCtx.originalEnv = { ...process.env };
  });

  afterEach((ctx) => {
    const testCtx = ctx as CreateKVTestContext;
    process.env = testCtx.originalEnv;
  });
}

/** Typed test function that receives CreateKVTestContext */
type TypedTestFn = (ctx: CreateKVTestContext) => Promise<void> | void;

/** Typed `it` that provides CreateKVTestContext to tests */
export const it = (name: string, fn: TypedTestFn): void => {
  baseIt(name, fn as (ctx: BaseTestContext) => Promise<void> | void);
};
