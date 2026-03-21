/**
 * Minimal vitest compatibility layer for running tests outside vitest.
 * Provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi
 *
 * Supports test context: each test gets an isolated context object that hooks
 * can populate. This enables concurrent test execution without shared state.
 */

/**
 * Test context - an isolated object for each test execution.
 * Hooks populate this, tests consume it.
 */
export interface TestContext {
  [key: string]: unknown;
}

type TestFn = (ctx: TestContext) => Promise<void> | void;
type HookFn = (ctx: TestContext) => Promise<void> | void;

interface TestCase {
  name: string;
  fn: TestFn;
  suite: string[];
}

interface TestSuite {
  name: string;
  parent: string[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
}

// Global state
const tests: TestCase[] = [];
const suites: Map<string, TestSuite> = new Map();
let currentSuite: string[] = [];

function getSuiteKey(path: string[]): string {
  return path.join(" > ");
}

function getOrCreateSuite(path: string[]): TestSuite {
  const key = getSuiteKey(path);
  const existing = suites.get(key);
  if (existing) {
    return existing;
  }
  const newSuite: TestSuite = {
    name: path[path.length - 1] || "root",
    parent: path.slice(0, -1),
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
  };
  suites.set(key, newSuite);
  return newSuite;
}

export function describe(name: string, fn: () => void): void {
  const previousSuite = currentSuite;
  currentSuite = [...currentSuite, name];
  getOrCreateSuite(currentSuite);
  fn();
  currentSuite = previousSuite;
}

export function it(name: string, fn: TestFn): void {
  tests.push({
    name,
    fn,
    suite: [...currentSuite],
  });
}

export const test = it;

export function beforeEach(fn: HookFn): void {
  const suite = getOrCreateSuite(currentSuite);
  suite.beforeEach.push(fn);
}

export function afterEach(fn: HookFn): void {
  const suite = getOrCreateSuite(currentSuite);
  suite.afterEach.push(fn);
}

export function beforeAll(fn: HookFn): void {
  const suite = getOrCreateSuite(currentSuite);
  suite.beforeAll.push(fn);
}

export function afterAll(fn: HookFn): void {
  const suite = getOrCreateSuite(currentSuite);
  suite.afterAll.push(fn);
}

// Expect implementation
type Matchers<T> = {
  toBe(expected: T, message?: string): void;
  toEqual(expected: unknown, message?: string): void;
  toBeTruthy(message?: string): void;
  toBeFalsy(message?: string): void;
  toBeNull(message?: string): void;
  toBeUndefined(message?: string): void;
  toBeDefined(message?: string): void;
  toBeInstanceOf(
    // biome-ignore lint/suspicious/noExplicitAny: Constructor types require any for compatibility
    expected: new (...args: any[]) => unknown,
    message?: string,
  ): void;
  toBeGreaterThan(expected: number, message?: string): void;
  toBeGreaterThanOrEqual(expected: number, message?: string): void;
  toBeLessThan(expected: number, message?: string): void;
  toBeLessThanOrEqual(expected: number, message?: string): void;
  toContain(expected: unknown, message?: string): void;
  toHaveLength(expected: number, message?: string): void;
  toMatch(expected: RegExp | string, message?: string): void;
  toThrow(expected?: string | RegExp | Error): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledTimes(expected: number): void;
  toHaveBeenCalledWith(...args: unknown[]): void;
  resolves: Matchers<Awaited<T>>;
  rejects: Matchers<unknown>;
  not: Matchers<T>;
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return a.equals(b);
  }

  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const aArr = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bArr = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (aArr.length !== bArr.length) return false;
    for (let i = 0; i < aArr.length; i++) {
      if (aArr[i] !== bArr[i]) return false;
    }
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        )
      )
        return false;
    }
    return true;
  }

  return false;
}

function formatValue(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return `Buffer<${value.toString("hex").slice(0, 20)}${value.length > 10 ? "..." : ""}>`;
  }
  if (typeof value === "string" && value.length > 100) {
    return JSON.stringify(`${value.slice(0, 100)}...`);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createMatchers<T>(
  actual: T,
  isNot = false,
  isAsync: "resolves" | "rejects" | null = null,
  customMessage?: string,
): Matchers<T> {
  const assert = (condition: boolean, message: string, inlineMsg?: string) => {
    const pass = isNot ? !condition : condition;
    if (!pass) {
      const msg = customMessage || inlineMsg || message;
      throw new Error(isNot ? `Expected NOT: ${msg}` : msg);
    }
  };

  const matchers: Matchers<T> = {
    toBe(expected: T, message?: string) {
      assert(
        actual === expected,
        `Expected ${formatValue(expected)}, got ${formatValue(actual)}`,
        message,
      );
    },

    toEqual(expected: unknown, message?: string) {
      assert(
        deepEqual(actual, expected),
        `Expected ${formatValue(expected)}, got ${formatValue(actual)}`,
        message,
      );
    },

    toBeTruthy() {
      assert(!!actual, `Expected truthy, got ${formatValue(actual)}`);
    },

    toBeFalsy() {
      assert(!actual, `Expected falsy, got ${formatValue(actual)}`);
    },

    toBeNull() {
      assert(actual === null, `Expected null, got ${formatValue(actual)}`);
    },

    toBeUndefined() {
      assert(
        actual === undefined,
        `Expected undefined, got ${formatValue(actual)}`,
      );
    },

    toBeDefined() {
      assert(
        actual !== undefined,
        `Expected defined, got ${formatValue(actual)}`,
      );
    },

    toBeInstanceOf(expected) {
      assert(
        actual instanceof expected,
        `Expected instance of ${expected.name}, got ${formatValue(actual)}`,
      );
    },

    toBeGreaterThan(expected: number) {
      assert(
        (actual as number) > expected,
        `Expected ${formatValue(actual)} > ${expected}`,
      );
    },

    toBeGreaterThanOrEqual(expected: number) {
      assert(
        (actual as number) >= expected,
        `Expected ${formatValue(actual)} >= ${expected}`,
      );
    },

    toBeLessThan(expected: number) {
      assert(
        (actual as number) < expected,
        `Expected ${formatValue(actual)} < ${expected}`,
      );
    },

    toBeLessThanOrEqual(expected: number) {
      assert(
        (actual as number) <= expected,
        `Expected ${formatValue(actual)} <= ${expected}`,
      );
    },

    toContain(expected: unknown) {
      if (typeof actual === "string") {
        assert(
          actual.includes(expected as string),
          `Expected "${actual}" to contain "${expected}"`,
        );
      } else if (Array.isArray(actual)) {
        assert(
          actual.some((item) => deepEqual(item, expected)),
          `Expected array to contain ${formatValue(expected)}`,
        );
      } else {
        throw new Error("toContain only works with strings and arrays");
      }
    },

    toHaveLength(expected: number) {
      const len = (actual as { length: number }).length;
      assert(len === expected, `Expected length ${expected}, got ${len}`);
    },

    toMatch(expected: RegExp | string) {
      const regex =
        typeof expected === "string" ? new RegExp(expected) : expected;
      assert(
        regex.test(actual as string),
        `Expected "${actual}" to match ${regex}`,
      );
    },

    toThrow(expected?: string | RegExp | Error) {
      let threw = false;
      let error: unknown;
      try {
        (actual as () => void)();
      } catch (e) {
        threw = true;
        error = e;
      }
      assert(threw, "Expected function to throw");
      if (expected !== undefined && error instanceof Error) {
        if (typeof expected === "string") {
          assert(
            error.message.includes(expected),
            `Expected error message to include "${expected}", got "${error.message}"`,
          );
        } else if (expected instanceof RegExp) {
          assert(
            expected.test(error.message),
            `Expected error message to match ${expected}, got "${error.message}"`,
          );
        }
      }
    },

    toHaveBeenCalled() {
      const mock = actual as MockFn<unknown[], unknown>;
      assert(
        mock.mock?.calls?.length > 0,
        "Expected function to have been called",
      );
    },

    toHaveBeenCalledTimes(expected: number) {
      const mock = actual as MockFn<unknown[], unknown>;
      const calls = mock.mock?.calls?.length ?? 0;
      assert(calls === expected, `Expected ${expected} calls, got ${calls}`);
    },

    toHaveBeenCalledWith(...args: unknown[]) {
      const mock = actual as MockFn<unknown[], unknown>;
      const calls = mock.mock?.calls ?? [];
      const found = calls.some((call) => deepEqual(call, args));
      assert(
        found,
        `Expected function to have been called with ${formatValue(args)}`,
      );
    },

    get resolves() {
      return {
        async toBe(expected: unknown) {
          const result = await (actual as Promise<unknown>);
          createMatchers(result, isNot).toBe(expected as T);
        },
        async toEqual(expected: unknown) {
          const result = await (actual as Promise<unknown>);
          createMatchers(result, isNot).toEqual(expected);
        },
        async toBeUndefined() {
          const result = await (actual as Promise<unknown>);
          createMatchers(result, isNot).toBeUndefined();
        },
        async not() {
          return createMatchers(actual, true, "resolves");
        },
      } as unknown as Matchers<Awaited<T>>;
    },

    get rejects() {
      return {
        async toThrow(expected?: string | RegExp) {
          let threw = false;
          let error: unknown;
          try {
            await (actual as Promise<unknown>);
          } catch (e) {
            threw = true;
            error = e;
          }
          assert(threw, "Expected promise to reject");
          if (expected !== undefined && error instanceof Error) {
            if (typeof expected === "string") {
              assert(
                error.message.includes(expected),
                `Expected error to include "${expected}"`,
              );
            } else if (expected instanceof RegExp) {
              assert(
                expected.test(error.message),
                `Expected error to match ${expected}`,
              );
            }
          }
        },
      } as unknown as Matchers<unknown>;
    },

    get not() {
      return createMatchers(actual, !isNot, isAsync, customMessage);
    },
  };

  return matchers;
}

export function expect<T>(actual: T, message?: string): Matchers<T> {
  return createMatchers(actual, false, null, message);
}

// Add expect.any() helper
// biome-ignore lint/suspicious/noExplicitAny: Constructor types require any for compatibility
expect.any = (ctor: new (...args: any[]) => unknown) => ({
  asymmetricMatch: (actual: unknown) => actual instanceof ctor,
  toString: () => `Any<${ctor.name}>`,
});

expect.objectContaining = (expected: Record<string, unknown>) => ({
  asymmetricMatch: (actual: unknown) => {
    if (typeof actual !== "object" || actual === null) return false;
    for (const [key, value] of Object.entries(expected)) {
      if (!deepEqual((actual as Record<string, unknown>)[key], value)) {
        return false;
      }
    }
    return true;
  },
  toString: () => `ObjectContaining(${JSON.stringify(expected)})`,
});

// Mock function implementation
interface MockFn<Args extends unknown[], Return> {
  (...args: Args): Return;
  mock: {
    calls: Args[];
    results: { type: "return" | "throw"; value: Return | unknown }[];
  };
  mockClear(): void;
  mockReset(): void;
  mockReturnValue(value: Return): MockFn<Args, Return>;
  mockReturnValueOnce(value: Return): MockFn<Args, Return>;
  mockResolvedValue(value: Awaited<Return>): MockFn<Args, Return>;
  mockResolvedValueOnce(value: Awaited<Return>): MockFn<Args, Return>;
  mockRejectedValue(value: unknown): MockFn<Args, Return>;
  mockRejectedValueOnce(value: unknown): MockFn<Args, Return>;
  mockImplementation(fn: (...args: Args) => Return): MockFn<Args, Return>;
  mockImplementationOnce(fn: (...args: Args) => Return): MockFn<Args, Return>;
}

function createMockFn<Args extends unknown[], Return>(
  impl?: (...args: Args) => Return,
): MockFn<Args, Return> {
  let defaultImpl = impl;
  let returnValue: Return | undefined;
  const returnValueOnce: Return[] = [];
  const implOnce: Array<(...args: Args) => Return> = [];

  const mock: MockFn<Args, Return>["mock"] = {
    calls: [],
    results: [],
  };

  const fn = ((...args: Args): Return => {
    mock.calls.push(args);

    try {
      let result: Return;

      if (implOnce.length > 0) {
        result = implOnce.shift()?.(...args) as Return;
      } else if (returnValueOnce.length > 0) {
        result = returnValueOnce[0] as Return;
        returnValueOnce.shift();
      } else if (returnValue !== undefined) {
        result = returnValue;
      } else if (defaultImpl) {
        result = defaultImpl(...args);
      } else {
        result = undefined as Return;
      }

      mock.results.push({ type: "return", value: result });
      return result;
    } catch (e) {
      mock.results.push({ type: "throw", value: e });
      throw e;
    }
  }) as MockFn<Args, Return>;

  fn.mock = mock;

  fn.mockClear = () => {
    mock.calls = [];
    mock.results = [];
  };

  fn.mockReset = () => {
    fn.mockClear();
    defaultImpl = undefined;
    returnValue = undefined;
    returnValueOnce.length = 0;
    implOnce.length = 0;
  };

  fn.mockReturnValue = (value: Return) => {
    returnValue = value;
    return fn;
  };

  fn.mockReturnValueOnce = (value: Return) => {
    returnValueOnce.push(value);
    return fn;
  };

  fn.mockResolvedValue = (value: Awaited<Return>) => {
    returnValue = Promise.resolve(value) as Return;
    return fn;
  };

  fn.mockResolvedValueOnce = (value: Awaited<Return>) => {
    returnValueOnce.push(Promise.resolve(value) as Return);
    return fn;
  };

  fn.mockRejectedValue = (value: unknown) => {
    returnValue = Promise.reject(value) as Return;
    return fn;
  };

  fn.mockRejectedValueOnce = (value: unknown) => {
    returnValueOnce.push(Promise.reject(value) as Return);
    return fn;
  };

  fn.mockImplementation = (newImpl: (...args: Args) => Return) => {
    defaultImpl = newImpl;
    return fn;
  };

  fn.mockImplementationOnce = (newImpl: (...args: Args) => Return) => {
    implOnce.push(newImpl);
    return fn;
  };

  return fn;
}

const vi = {
  fn: createMockFn,
  clearAllMocks() {
    // No-op in this simple implementation
  },
  mock(_module: string, _factory?: () => unknown) {
    // Module mocking not supported in this simple implementation
    console.warn("vi.mock() is not supported in vitest-compat");
  },
  spyOn<T extends object, K extends keyof T>(
    obj: T,
    method: K,
  ): MockFn<unknown[], unknown> & { mockRestore(): void } {
    const original = obj[method];
    const mock = createMockFn() as MockFn<unknown[], unknown> & {
      mockRestore(): void;
    };
    mock.mockImplementation((...args: unknown[]) => {
      if (typeof original === "function") {
        return original.apply(obj, args);
      }
      return undefined;
    });
    mock.mockRestore = () => {
      obj[method] = original;
    };
    obj[method] = mock as unknown as T[K];
    return mock;
  },
  useFakeTimers() {
    // Fake timers not fully supported - tests using this should be skipped
    console.warn("vi.useFakeTimers() is not fully supported in vitest-compat");
  },
  useRealTimers() {
    // No-op
  },
  advanceTimersByTimeAsync(_ms: number): Promise<void> {
    return Promise.resolve();
  },
};

// Test runner
export interface TestResult {
  name: string;
  suite: string[];
  passed: boolean;
  error?: string;
  duration: number;
}

export interface RunResult {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  results: TestResult[];
}

export interface RunTestsOptions {
  filter?: string | RegExp;
  onProgress?: (result: TestResult) => void;
  /** Number of tests to run concurrently (default: 1) */
  concurrency?: number;
  /** Callback for keep-alive messages during slow tests */
  onKeepAlive?: (testName: string, elapsedMs: number) => void;
  /** Interval in ms for keep-alive messages (default: 5000) */
  keepAliveInterval?: number;
}

export async function runTests(
  filterOrOptions?: string | RegExp | RunTestsOptions,
  onProgress?: (result: TestResult) => void,
): Promise<RunResult> {
  // Handle both old and new signatures
  let filter: string | RegExp | undefined;
  let progressCallback = onProgress;
  let concurrency = 1;

  let keepAliveCallback:
    | ((testName: string, elapsedMs: number) => void)
    | undefined;
  let keepAliveInterval = 5000;

  if (
    filterOrOptions &&
    typeof filterOrOptions === "object" &&
    !("test" in filterOrOptions)
  ) {
    // New options object
    filter = filterOrOptions.filter;
    progressCallback = filterOrOptions.onProgress;
    concurrency = filterOrOptions.concurrency ?? 1;
    keepAliveCallback = filterOrOptions.onKeepAlive;
    keepAliveInterval = filterOrOptions.keepAliveInterval ?? 5000;
  } else {
    // Old signature: filter, onProgress
    filter = filterOrOptions as string | RegExp | undefined;
  }
  const results: TestResult[] = [];
  const startTime = Date.now();
  const ranBeforeAll = new Set<string>();
  const ranAfterAll = new Set<string>();

  // Filter tests
  const testsToRun = filter
    ? tests.filter((t) => {
        const fullName = [...t.suite, t.name].join(" > ");
        return typeof filter === "string"
          ? fullName.includes(filter)
          : filter.test(fullName);
      })
    : tests;

  // Collect all hooks for a test's suite hierarchy
  const getHooks = (suitePath: string[]) => {
    const beforeAllHooks: HookFn[] = [];
    const afterAllHooks: HookFn[] = [];
    const beforeEachHooks: HookFn[] = [];
    const afterEachHooks: HookFn[] = [];

    for (let i = 0; i <= suitePath.length; i++) {
      const path = suitePath.slice(0, i);
      const suite = suites.get(getSuiteKey(path));
      if (suite) {
        beforeAllHooks.push(...suite.beforeAll);
        afterAllHooks.push(...suite.afterAll);
        beforeEachHooks.push(...suite.beforeEach);
        afterEachHooks.push(...suite.afterEach);
      }
    }

    return { beforeAllHooks, afterAllHooks, beforeEachHooks, afterEachHooks };
  };

  // Suite-level shared context (populated by beforeAll, shared across tests in suite)
  const suiteContexts: Map<string, TestContext> = new Map();

  // Run all beforeAll hooks upfront (sequentially to maintain order)
  for (const testCase of testsToRun) {
    for (let i = 0; i <= testCase.suite.length; i++) {
      const path = testCase.suite.slice(0, i);
      const key = getSuiteKey(path);
      if (!ranBeforeAll.has(key)) {
        ranBeforeAll.add(key);
        // Create suite context
        const suiteCtx: TestContext = {};
        suiteContexts.set(key, suiteCtx);
        const suite = suites.get(key);
        if (suite) {
          for (const hook of suite.beforeAll) {
            await hook(suiteCtx);
          }
        }
      }
    }
  }

  // Get combined suite context for a test (merges all parent suite contexts)
  const getSuiteContext = (suitePath: string[]): TestContext => {
    const combined: TestContext = {};
    for (let i = 0; i <= suitePath.length; i++) {
      const path = suitePath.slice(0, i);
      const key = getSuiteKey(path);
      const suiteCtx = suiteContexts.get(key);
      if (suiteCtx) {
        Object.assign(combined, suiteCtx);
      }
    }
    return combined;
  };

  // Run a single test with isolated context
  const runTest = async (testCase: TestCase): Promise<TestResult> => {
    const testStart = Date.now();
    const { beforeEachHooks, afterEachHooks } = getHooks(testCase.suite);
    const fullTestName = [...testCase.suite, testCase.name].join(" > ");

    // Set up keep-alive timer for slow tests
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    if (keepAliveCallback) {
      keepAliveTimer = setInterval(() => {
        const elapsed = Date.now() - testStart;
        keepAliveCallback?.(fullTestName, elapsed);
      }, keepAliveInterval);
    }

    // Create isolated context for this test, seeded with suite context
    const ctx: TestContext = { ...getSuiteContext(testCase.suite) };

    try {
      // Run beforeEach hooks - they populate the context
      for (const hook of beforeEachHooks) {
        await hook(ctx);
      }

      // Run test with context
      await testCase.fn(ctx);

      // Run afterEach hooks
      for (const hook of afterEachHooks) {
        await hook(ctx);
      }

      return {
        name: testCase.name,
        suite: testCase.suite,
        passed: true,
        duration: Date.now() - testStart,
      };
    } catch (err) {
      return {
        name: testCase.name,
        suite: testCase.suite,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - testStart,
      };
    } finally {
      // Clean up keep-alive timer
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }
    }
  };

  // Run tests with concurrency pool - results print immediately as tests complete
  let nextIndex = 0;

  const getNextTest = (): TestCase | undefined => {
    if (nextIndex < testsToRun.length) {
      return testsToRun[nextIndex++];
    }
    return undefined;
  };

  const worker = async (): Promise<void> => {
    let testCase = getNextTest();
    while (testCase !== undefined) {
      const result = await runTest(testCase);
      results.push(result);
      progressCallback?.(result);
      testCase = getNextTest();
    }
  };

  // Start up to `concurrency` workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, testsToRun.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Run afterAll hooks with suite context
  for (const [key, suite] of suites) {
    if (!ranAfterAll.has(key)) {
      ranAfterAll.add(key);
      const suiteCtx = suiteContexts.get(key) ?? {};
      for (const hook of suite.afterAll) {
        try {
          await hook(suiteCtx);
        } catch (err) {
          console.error(`afterAll hook failed for ${key}:`, err);
        }
      }
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    passed,
    failed,
    total: results.length,
    duration: Date.now() - startTime,
    results,
  };
}

// Reset state (useful between test file loads)
export function resetTestState(): void {
  tests.length = 0;
  suites.clear();
  currentSuite = [];
}

// Export for test file registration
export function getRegisteredTests(): TestCase[] {
  return tests;
}
