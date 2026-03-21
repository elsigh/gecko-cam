/**
 * Minimal vitest compatibility layer for running tests outside vitest.
 * Provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi
 *
 * Supports test context: each test gets an isolated context object that hooks
 * can populate. This enables concurrent test execution without shared state.
 */
// Global state
const tests = [];
const suites = new Map();
let currentSuite = [];
function getSuiteKey(path) {
    return path.join(" > ");
}
function getOrCreateSuite(path) {
    const key = getSuiteKey(path);
    const existing = suites.get(key);
    if (existing) {
        return existing;
    }
    const newSuite = {
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
export function describe(name, fn) {
    const previousSuite = currentSuite;
    currentSuite = [...currentSuite, name];
    getOrCreateSuite(currentSuite);
    fn();
    currentSuite = previousSuite;
}
export function it(name, fn) {
    tests.push({
        name,
        fn,
        suite: [...currentSuite],
    });
}
export const test = it;
export function beforeEach(fn) {
    const suite = getOrCreateSuite(currentSuite);
    suite.beforeEach.push(fn);
}
export function afterEach(fn) {
    const suite = getOrCreateSuite(currentSuite);
    suite.afterEach.push(fn);
}
export function beforeAll(fn) {
    const suite = getOrCreateSuite(currentSuite);
    suite.beforeAll.push(fn);
}
export function afterAll(fn) {
    const suite = getOrCreateSuite(currentSuite);
    suite.afterAll.push(fn);
}
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null)
        return a === b;
    if (typeof a !== typeof b)
        return false;
    if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
        return a.equals(b);
    }
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
        const aArr = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        const bArr = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        if (aArr.length !== bArr.length)
            return false;
        for (let i = 0; i < aArr.length; i++) {
            if (aArr[i] !== bArr[i])
                return false;
        }
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i]))
                return false;
        }
        return true;
    }
    if (typeof a === "object" && typeof b === "object") {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length)
            return false;
        for (const key of aKeys) {
            if (!deepEqual(a[key], b[key]))
                return false;
        }
        return true;
    }
    return false;
}
function formatValue(value) {
    if (Buffer.isBuffer(value)) {
        return `Buffer<${value.toString("hex").slice(0, 20)}${value.length > 10 ? "..." : ""}>`;
    }
    if (typeof value === "string" && value.length > 100) {
        return JSON.stringify(`${value.slice(0, 100)}...`);
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
function createMatchers(actual, isNot = false, isAsync = null, customMessage) {
    const assert = (condition, message, inlineMsg) => {
        const pass = isNot ? !condition : condition;
        if (!pass) {
            const msg = customMessage || inlineMsg || message;
            throw new Error(isNot ? `Expected NOT: ${msg}` : msg);
        }
    };
    const matchers = {
        toBe(expected, message) {
            assert(actual === expected, `Expected ${formatValue(expected)}, got ${formatValue(actual)}`, message);
        },
        toEqual(expected, message) {
            assert(deepEqual(actual, expected), `Expected ${formatValue(expected)}, got ${formatValue(actual)}`, message);
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
            assert(actual === undefined, `Expected undefined, got ${formatValue(actual)}`);
        },
        toBeDefined() {
            assert(actual !== undefined, `Expected defined, got ${formatValue(actual)}`);
        },
        toBeInstanceOf(expected) {
            assert(actual instanceof expected, `Expected instance of ${expected.name}, got ${formatValue(actual)}`);
        },
        toBeGreaterThan(expected) {
            assert(actual > expected, `Expected ${formatValue(actual)} > ${expected}`);
        },
        toBeGreaterThanOrEqual(expected) {
            assert(actual >= expected, `Expected ${formatValue(actual)} >= ${expected}`);
        },
        toBeLessThan(expected) {
            assert(actual < expected, `Expected ${formatValue(actual)} < ${expected}`);
        },
        toBeLessThanOrEqual(expected) {
            assert(actual <= expected, `Expected ${formatValue(actual)} <= ${expected}`);
        },
        toContain(expected) {
            if (typeof actual === "string") {
                assert(actual.includes(expected), `Expected "${actual}" to contain "${expected}"`);
            }
            else if (Array.isArray(actual)) {
                assert(actual.some((item) => deepEqual(item, expected)), `Expected array to contain ${formatValue(expected)}`);
            }
            else {
                throw new Error("toContain only works with strings and arrays");
            }
        },
        toHaveLength(expected) {
            const len = actual.length;
            assert(len === expected, `Expected length ${expected}, got ${len}`);
        },
        toMatch(expected) {
            const regex = typeof expected === "string" ? new RegExp(expected) : expected;
            assert(regex.test(actual), `Expected "${actual}" to match ${regex}`);
        },
        toThrow(expected) {
            let threw = false;
            let error;
            try {
                actual();
            }
            catch (e) {
                threw = true;
                error = e;
            }
            assert(threw, "Expected function to throw");
            if (expected !== undefined && error instanceof Error) {
                if (typeof expected === "string") {
                    assert(error.message.includes(expected), `Expected error message to include "${expected}", got "${error.message}"`);
                }
                else if (expected instanceof RegExp) {
                    assert(expected.test(error.message), `Expected error message to match ${expected}, got "${error.message}"`);
                }
            }
        },
        toHaveBeenCalled() {
            const mock = actual;
            assert(mock.mock?.calls?.length > 0, "Expected function to have been called");
        },
        toHaveBeenCalledTimes(expected) {
            const mock = actual;
            const calls = mock.mock?.calls?.length ?? 0;
            assert(calls === expected, `Expected ${expected} calls, got ${calls}`);
        },
        toHaveBeenCalledWith(...args) {
            const mock = actual;
            const calls = mock.mock?.calls ?? [];
            const found = calls.some((call) => deepEqual(call, args));
            assert(found, `Expected function to have been called with ${formatValue(args)}`);
        },
        get resolves() {
            return {
                async toBe(expected) {
                    const result = await actual;
                    createMatchers(result, isNot).toBe(expected);
                },
                async toEqual(expected) {
                    const result = await actual;
                    createMatchers(result, isNot).toEqual(expected);
                },
                async toBeUndefined() {
                    const result = await actual;
                    createMatchers(result, isNot).toBeUndefined();
                },
                async not() {
                    return createMatchers(actual, true, "resolves");
                },
            };
        },
        get rejects() {
            return {
                async toThrow(expected) {
                    let threw = false;
                    let error;
                    try {
                        await actual;
                    }
                    catch (e) {
                        threw = true;
                        error = e;
                    }
                    assert(threw, "Expected promise to reject");
                    if (expected !== undefined && error instanceof Error) {
                        if (typeof expected === "string") {
                            assert(error.message.includes(expected), `Expected error to include "${expected}"`);
                        }
                        else if (expected instanceof RegExp) {
                            assert(expected.test(error.message), `Expected error to match ${expected}`);
                        }
                    }
                },
            };
        },
        get not() {
            return createMatchers(actual, !isNot, isAsync, customMessage);
        },
    };
    return matchers;
}
export function expect(actual, message) {
    return createMatchers(actual, false, null, message);
}
// Add expect.any() helper
// biome-ignore lint/suspicious/noExplicitAny: Constructor types require any for compatibility
expect.any = (ctor) => ({
    asymmetricMatch: (actual) => actual instanceof ctor,
    toString: () => `Any<${ctor.name}>`,
});
expect.objectContaining = (expected) => ({
    asymmetricMatch: (actual) => {
        if (typeof actual !== "object" || actual === null)
            return false;
        for (const [key, value] of Object.entries(expected)) {
            if (!deepEqual(actual[key], value)) {
                return false;
            }
        }
        return true;
    },
    toString: () => `ObjectContaining(${JSON.stringify(expected)})`,
});
function createMockFn(impl) {
    let defaultImpl = impl;
    let returnValue;
    const returnValueOnce = [];
    const implOnce = [];
    const mock = {
        calls: [],
        results: [],
    };
    const fn = ((...args) => {
        mock.calls.push(args);
        try {
            let result;
            if (implOnce.length > 0) {
                result = implOnce.shift()?.(...args);
            }
            else if (returnValueOnce.length > 0) {
                result = returnValueOnce[0];
                returnValueOnce.shift();
            }
            else if (returnValue !== undefined) {
                result = returnValue;
            }
            else if (defaultImpl) {
                result = defaultImpl(...args);
            }
            else {
                result = undefined;
            }
            mock.results.push({ type: "return", value: result });
            return result;
        }
        catch (e) {
            mock.results.push({ type: "throw", value: e });
            throw e;
        }
    });
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
    fn.mockReturnValue = (value) => {
        returnValue = value;
        return fn;
    };
    fn.mockReturnValueOnce = (value) => {
        returnValueOnce.push(value);
        return fn;
    };
    fn.mockResolvedValue = (value) => {
        returnValue = Promise.resolve(value);
        return fn;
    };
    fn.mockResolvedValueOnce = (value) => {
        returnValueOnce.push(Promise.resolve(value));
        return fn;
    };
    fn.mockRejectedValue = (value) => {
        returnValue = Promise.reject(value);
        return fn;
    };
    fn.mockRejectedValueOnce = (value) => {
        returnValueOnce.push(Promise.reject(value));
        return fn;
    };
    fn.mockImplementation = (newImpl) => {
        defaultImpl = newImpl;
        return fn;
    };
    fn.mockImplementationOnce = (newImpl) => {
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
    mock(_module, _factory) {
        // Module mocking not supported in this simple implementation
        console.warn("vi.mock() is not supported in vitest-compat");
    },
    spyOn(obj, method) {
        const original = obj[method];
        const mock = createMockFn();
        mock.mockImplementation((...args) => {
            if (typeof original === "function") {
                return original.apply(obj, args);
            }
            return undefined;
        });
        mock.mockRestore = () => {
            obj[method] = original;
        };
        obj[method] = mock;
        return mock;
    },
    useFakeTimers() {
        // Fake timers not fully supported - tests using this should be skipped
        console.warn("vi.useFakeTimers() is not fully supported in vitest-compat");
    },
    useRealTimers() {
        // No-op
    },
    advanceTimersByTimeAsync(_ms) {
        return Promise.resolve();
    },
};
export async function runTests(filterOrOptions, onProgress) {
    // Handle both old and new signatures
    let filter;
    let progressCallback = onProgress;
    let concurrency = 1;
    let keepAliveCallback;
    let keepAliveInterval = 5000;
    if (filterOrOptions &&
        typeof filterOrOptions === "object" &&
        !("test" in filterOrOptions)) {
        // New options object
        filter = filterOrOptions.filter;
        progressCallback = filterOrOptions.onProgress;
        concurrency = filterOrOptions.concurrency ?? 1;
        keepAliveCallback = filterOrOptions.onKeepAlive;
        keepAliveInterval = filterOrOptions.keepAliveInterval ?? 5000;
    }
    else {
        // Old signature: filter, onProgress
        filter = filterOrOptions;
    }
    const results = [];
    const startTime = Date.now();
    const ranBeforeAll = new Set();
    const ranAfterAll = new Set();
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
    const getHooks = (suitePath) => {
        const beforeAllHooks = [];
        const afterAllHooks = [];
        const beforeEachHooks = [];
        const afterEachHooks = [];
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
    const suiteContexts = new Map();
    // Run all beforeAll hooks upfront (sequentially to maintain order)
    for (const testCase of testsToRun) {
        for (let i = 0; i <= testCase.suite.length; i++) {
            const path = testCase.suite.slice(0, i);
            const key = getSuiteKey(path);
            if (!ranBeforeAll.has(key)) {
                ranBeforeAll.add(key);
                // Create suite context
                const suiteCtx = {};
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
    const getSuiteContext = (suitePath) => {
        const combined = {};
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
    const runTest = async (testCase) => {
        const testStart = Date.now();
        const { beforeEachHooks, afterEachHooks } = getHooks(testCase.suite);
        const fullTestName = [...testCase.suite, testCase.name].join(" > ");
        // Set up keep-alive timer for slow tests
        let keepAliveTimer = null;
        if (keepAliveCallback) {
            keepAliveTimer = setInterval(() => {
                const elapsed = Date.now() - testStart;
                keepAliveCallback?.(fullTestName, elapsed);
            }, keepAliveInterval);
        }
        // Create isolated context for this test, seeded with suite context
        const ctx = { ...getSuiteContext(testCase.suite) };
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
        }
        catch (err) {
            return {
                name: testCase.name,
                suite: testCase.suite,
                passed: false,
                error: err instanceof Error ? err.message : String(err),
                duration: Date.now() - testStart,
            };
        }
        finally {
            // Clean up keep-alive timer
            if (keepAliveTimer) {
                clearInterval(keepAliveTimer);
            }
        }
    };
    // Run tests with concurrency pool - results print immediately as tests complete
    let nextIndex = 0;
    const getNextTest = () => {
        if (nextIndex < testsToRun.length) {
            return testsToRun[nextIndex++];
        }
        return undefined;
    };
    const worker = async () => {
        let testCase = getNextTest();
        while (testCase !== undefined) {
            const result = await runTest(testCase);
            results.push(result);
            progressCallback?.(result);
            testCase = getNextTest();
        }
    };
    // Start up to `concurrency` workers
    const workers = [];
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
                }
                catch (err) {
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
export function resetTestState() {
    tests.length = 0;
    suites.clear();
    currentSuite = [];
}
// Export for test file registration
export function getRegisteredTests() {
    return tests;
}
//# sourceMappingURL=vitest-compat.js.map