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
export declare function describe(name: string, fn: () => void): void;
export declare function it(name: string, fn: TestFn): void;
export declare const test: typeof it;
export declare function beforeEach(fn: HookFn): void;
export declare function afterEach(fn: HookFn): void;
export declare function beforeAll(fn: HookFn): void;
export declare function afterAll(fn: HookFn): void;
type Matchers<T> = {
    toBe(expected: T, message?: string): void;
    toEqual(expected: unknown, message?: string): void;
    toBeTruthy(message?: string): void;
    toBeFalsy(message?: string): void;
    toBeNull(message?: string): void;
    toBeUndefined(message?: string): void;
    toBeDefined(message?: string): void;
    toBeInstanceOf(expected: new (...args: any[]) => unknown, message?: string): void;
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
export declare function expect<T>(actual: T, message?: string): Matchers<T>;
export declare namespace expect {
    var any: (ctor: new (...args: any[]) => unknown) => {
        asymmetricMatch: (actual: unknown) => boolean;
        toString: () => string;
    };
    var objectContaining: (expected: Record<string, unknown>) => {
        asymmetricMatch: (actual: unknown) => boolean;
        toString: () => string;
    };
}
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
export declare function runTests(filterOrOptions?: string | RegExp | RunTestsOptions, onProgress?: (result: TestResult) => void): Promise<RunResult>;
export declare function resetTestState(): void;
export declare function getRegisteredTests(): TestCase[];
export {};
//# sourceMappingURL=vitest-compat.d.ts.map