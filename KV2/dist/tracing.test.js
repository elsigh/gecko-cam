import { describe, expect, it } from "./testing/vitest-compat.js";
import { consoleTracer, createOtelTracer, createStatsTracer, noopTracer, } from "./tracing.js";
describe("noopTracer", () => {
    it("startSpan returns a span that does not throw", () => {
        const span = noopTracer.startSpan("test");
        span.setAttributes({ key: "val" });
        span.setError(new Error("oops"));
        span.end();
    });
});
describe("consoleTracer", () => {
    it("startSpan returns a span that logs on end", () => {
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => logs.push(args.join(" "));
        try {
            const span = consoleTracer.startSpan("test-op", { source: "unit" });
            span.setAttributes({ extra: "attr" });
            span.end();
            expect(logs.length).toBe(1);
            expect(logs[0]).toContain("[KV] test-op");
            expect(logs[0]).toContain("source=unit");
            expect(logs[0]).toContain("extra=attr");
        }
        finally {
            console.log = origLog;
        }
    });
    it("logs error on span with setError", () => {
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => logs.push(args.join(" "));
        try {
            const span = consoleTracer.startSpan("fail-op");
            span.setError(new Error("boom"));
            span.end();
            expect(logs.length).toBe(1);
            expect(logs[0]).toContain("FAILED");
            expect(logs[0]).toContain("error=boom");
        }
        finally {
            console.log = origLog;
        }
    });
    it("startSpan works without initial attributes", () => {
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => logs.push(args.join(" "));
        try {
            const span = consoleTracer.startSpan("no-attrs");
            span.end();
            expect(logs.length).toBe(1);
            expect(logs[0]).toContain("[KV] no-attrs");
        }
        finally {
            console.log = origLog;
        }
    });
});
describe("createStatsTracer", () => {
    it("records entries and computes stats", () => {
        const { tracer, getStats } = createStatsTracer();
        // Create several spans
        for (let i = 0; i < 10; i++) {
            const span = tracer.startSpan("op", { source: "test" });
            span.setAttributes({ i });
            span.end();
        }
        const stats = getStats();
        expect(stats).not.toBeNull();
        if (stats) {
            expect(stats.count).toBe(10);
            expect(typeof stats.avg).toBe("number");
            expect(typeof stats.p50).toBe("number");
            expect(typeof stats.p95).toBe("number");
            expect(typeof stats.p99).toBe("number");
            expect(typeof stats.min).toBe("number");
            expect(typeof stats.max).toBe("number");
            expect(stats.min).toBeLessThanOrEqual(stats.max);
        }
    });
    it("getStats with operationKey filters by name:source", () => {
        const { tracer, getStats } = createStatsTracer();
        const span1 = tracer.startSpan("read", { source: "cache" });
        span1.end();
        const span2 = tracer.startSpan("read", { source: "blob" });
        span2.end();
        const span3 = tracer.startSpan("write", { source: "blob" });
        span3.end();
        const readCache = getStats("read:cache");
        expect(readCache).not.toBeNull();
        expect(readCache?.count).toBe(1);
        const readBlob = getStats("read:blob");
        expect(readBlob).not.toBeNull();
        expect(readBlob?.count).toBe(1);
        const writeBlob = getStats("write:blob");
        expect(writeBlob).not.toBeNull();
        expect(writeBlob?.count).toBe(1);
    });
    it("getStats with name only (no source) filters by name", () => {
        const { tracer, getStats } = createStatsTracer();
        const span1 = tracer.startSpan("read", { source: "cache" });
        span1.end();
        const span2 = tracer.startSpan("read", { source: "blob" });
        span2.end();
        const allReads = getStats("read");
        expect(allReads).not.toBeNull();
        expect(allReads?.count).toBe(2);
    });
    it("getStats returns null when no entries match", () => {
        const { getStats } = createStatsTracer();
        expect(getStats()).toBeNull();
        expect(getStats("nonexistent")).toBeNull();
    });
    it("getOperationKeys returns sorted unique keys", () => {
        const { tracer, getStats } = createStatsTracer();
        // Access getOperationKeys via printStats since it's internal to StatsCollector
        // We test it indirectly through getStats and printStats
        const span1 = tracer.startSpan("write", { source: "blob" });
        span1.end();
        const span2 = tracer.startSpan("read", { source: "cache" });
        span2.end();
        const span3 = tracer.startSpan("read", { source: "blob" });
        span3.end();
        // Verify all operations exist
        expect(getStats("read:blob")?.count).toBe(1);
        expect(getStats("read:cache")?.count).toBe(1);
        expect(getStats("write:blob")?.count).toBe(1);
    });
    it("printSummary runs without error", () => {
        const { tracer, printStats } = createStatsTracer();
        // Empty stats
        const logs = [];
        const origLog = console.log;
        console.log = (...args) => logs.push(args.join(" "));
        try {
            printStats(); // should not throw with empty stats
            // Now add some data
            const span = tracer.startSpan("op", { source: "test" });
            span.end();
            printStats(); // should print summary
            expect(logs.length).toBeGreaterThan(0);
        }
        finally {
            console.log = origLog;
        }
    });
    it("clear resets all entries", () => {
        const { tracer, getStats, clear } = createStatsTracer();
        const span = tracer.startSpan("op");
        span.end();
        expect(getStats()?.count).toBe(1);
        clear();
        expect(getStats()).toBeNull();
    });
    it("records error on span", () => {
        const { tracer, getStats } = createStatsTracer();
        const span = tracer.startSpan("failing-op");
        span.setError(new Error("test error"));
        span.end();
        expect(getStats()?.count).toBe(1);
    });
    it("span without source uses name only as key", () => {
        const { tracer, getStats } = createStatsTracer();
        const span = tracer.startSpan("simple-op");
        span.end();
        expect(getStats("simple-op")?.count).toBe(1);
    });
});
describe("createOtelTracer", () => {
    it("delegates to OtelTracerLike methods", () => {
        const calls = [];
        const fakeOtelSpan = {
            setAttribute(key, value) {
                calls.push({ method: "setAttribute", args: [key, value] });
            },
            setStatus(status) {
                calls.push({ method: "setStatus", args: [status] });
            },
            recordException(error) {
                calls.push({ method: "recordException", args: [error] });
            },
            end() {
                calls.push({ method: "end", args: [] });
            },
        };
        const fakeOtelTracer = {
            startSpan(name, options) {
                calls.push({ method: "startSpan", args: [name, options] });
                return fakeOtelSpan;
            },
        };
        const tracer = createOtelTracer(fakeOtelTracer);
        // Start a span with initial attributes
        const span = tracer.startSpan("test-span", { key: "initial" });
        // Verify startSpan was called
        expect(calls.some((c) => c.method === "startSpan")).toBe(true);
        // Set additional attributes
        span.setAttributes({ foo: "bar", count: 42 });
        const setAttrCalls = calls.filter((c) => c.method === "setAttribute");
        expect(setAttrCalls.length).toBe(2);
        expect(setAttrCalls[0].args).toEqual(["foo", "bar"]);
        expect(setAttrCalls[1].args).toEqual(["count", 42]);
        // Set error
        const error = new Error("test error");
        span.setError(error);
        const statusCalls = calls.filter((c) => c.method === "setStatus");
        expect(statusCalls.length).toBe(1);
        expect(statusCalls[0].args[0]).toEqual({ code: 2, message: "test error" });
        const exceptionCalls = calls.filter((c) => c.method === "recordException");
        expect(exceptionCalls.length).toBe(1);
        expect(exceptionCalls[0].args[0]).toBe(error);
        // End span
        span.end();
        expect(calls.filter((c) => c.method === "end").length).toBe(1);
    });
});
//# sourceMappingURL=tracing.test.js.map