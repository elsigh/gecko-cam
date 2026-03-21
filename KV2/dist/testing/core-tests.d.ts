/**
 * Core test definitions that can be run with either vitest or vitest-compat.
 * These functions accept the testing primitives as parameters to allow
 * framework-agnostic test definitions.
 */
type DescribeFn = (name: string, fn: () => void) => void;
type ItFn = (name: string, fn: () => Promise<void> | void) => void;
type ExpectFn = <T>(actual: T) => {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
};
type BeforeEachFn = (fn: () => void) => void;
type AfterEachFn = (fn: () => void) => void;
interface TestingPrimitives {
    describe: DescribeFn;
    it: ItFn;
    expect: ExpectFn;
    beforeEach: BeforeEachFn;
    afterEach: AfterEachFn;
}
export declare function registerCoreTests(t: TestingPrimitives): void;
export declare function registerBinaryTests(t: TestingPrimitives): void;
export declare function registerLargeValueTests(t: TestingPrimitives): void;
export declare function registerTypedKVTests(t: TestingPrimitives): void;
export declare function registerStreamingTests(t: TestingPrimitives): void;
export declare function registerStressTests(t: TestingPrimitives): void;
export declare function registerAllTests(t: TestingPrimitives): void;
export {};
//# sourceMappingURL=core-tests.d.ts.map