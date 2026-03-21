import { KV2 } from "../cached-kv.js";
import { FakeBlobStore } from "../testing/fake-blob-store.js";
import { uniqueTestPrefix } from "../testing/index.js";
import {
  type TestContext as BaseTestContext,
  afterEach as baseAfterEach,
  beforeEach as baseBeforeEach,
  it as baseIt,
} from "../testing/vitest-compat.js";
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
export const it = (name: string, fn: TypedTestFn): void => {
  baseIt(name, fn as (ctx: BaseTestContext) => Promise<void> | void);
};

/** Typed `beforeEach` that provides ChaosTestContext */
export const beforeEach = (fn: TypedHookFn): void => {
  baseBeforeEach(fn as (ctx: BaseTestContext) => Promise<void> | void);
};

/** Typed `afterEach` that provides ChaosTestContext */
export const afterEach = (fn: TypedHookFn): void => {
  baseAfterEach(fn as (ctx: BaseTestContext) => Promise<void> | void);
};

/**
 * Sets up standard chaos test context with FakeBlobStore and KV2.
 * Each test gets its own isolated instances.
 */
export function setupChaosContext(): void {
  beforeEach((ctx) => {
    ctx.prefix = uniqueTestPrefix();
    ctx.blobStore = new FakeBlobStore();
    ctx.kv = new KV2<TestMetadata>({
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
export type { PrefixString } from "../types.js";
