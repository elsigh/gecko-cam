/**
 * Performance comparison test: raw blob access vs cached reads
 */
export interface PerfResult {
    rawBlobReads: number[];
    cachedReads: number[];
    rawBlobAvg: number;
    cachedAvg: number;
    speedup: number;
    summary: string;
}
export declare function runPerfTest(iterations?: number): Promise<PerfResult>;
//# sourceMappingURL=perf-test.d.ts.map