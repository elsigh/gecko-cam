/**
 * Pluggable tracing system for KV2.
 *
 * Provides a simple span-based API that can be backed by:
 * - Console logging (default for debugging)
 * - No-op (production default)
 * - OpenTelemetry (plug in your own tracer)
 */
/**
 * No-op tracer for production (zero overhead).
 */
class NoopSpan {
    setAttributes() { }
    setError() { }
    end() { }
}
const noopSpan = new NoopSpan();
export const noopTracer = {
    startSpan() {
        return noopSpan;
    },
};
/**
 * Console logging tracer for debugging.
 * Logs span start, attributes, errors, and duration.
 */
class ConsoleSpan {
    name;
    startTime;
    attrs;
    error;
    constructor(name, attributes) {
        this.name = name;
        this.startTime = performance.now();
        this.attrs = attributes ?? {};
    }
    setAttributes(attrs) {
        Object.assign(this.attrs, attrs);
    }
    setError(error) {
        this.error = error;
    }
    end() {
        const duration = performance.now() - this.startTime;
        const attrs = Object.entries(this.attrs)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
        if (this.error) {
            console.log(`[KV] ${this.name} FAILED ${duration.toFixed(1)}ms ${attrs} error=${this.error.message}`);
        }
        else {
            console.log(`[KV] ${this.name} ${duration.toFixed(1)}ms ${attrs}`);
        }
    }
}
export const consoleTracer = {
    startSpan(name, attributes) {
        return new ConsoleSpan(name, attributes);
    },
};
export function createOtelTracer(otelTracer) {
    return {
        startSpan(name, attributes) {
            const span = otelTracer.startSpan(name, { attributes });
            return {
                setAttributes(attrs) {
                    for (const [key, value] of Object.entries(attrs)) {
                        span.setAttribute(key, value);
                    }
                },
                setError(error) {
                    span.setStatus({ code: 2, message: error.message }); // OTEL SpanStatusCode.ERROR = 2
                    span.recordException(error);
                },
                end() {
                    span.end();
                },
            };
        },
    };
}
class StatsSpan {
    name;
    startTime;
    attrs;
    error;
    collector;
    constructor(name, collector, attributes) {
        this.name = name;
        this.startTime = performance.now();
        this.attrs = attributes ?? {};
        this.collector = collector;
    }
    setAttributes(attrs) {
        Object.assign(this.attrs, attrs);
    }
    setError(error) {
        this.error = error;
    }
    end() {
        const durationMs = performance.now() - this.startTime;
        this.collector.record({
            name: this.name,
            durationMs,
            attributes: this.attrs,
            error: this.error?.message,
        });
    }
}
class StatsCollector {
    entries = [];
    record(entry) {
        this.entries.push(entry);
    }
    clear() {
        this.entries = [];
    }
    /** Get unique operation keys (name + source) */
    getOperationKeys() {
        const keys = new Set();
        for (const e of this.entries) {
            const source = e.attributes.source;
            const key = source ? `${e.name}:${source}` : e.name;
            keys.add(key);
        }
        return [...keys].sort();
    }
    getStats(operationKey) {
        let filtered;
        if (operationKey) {
            const [name, source] = operationKey.includes(":")
                ? operationKey.split(":")
                : [operationKey, undefined];
            filtered = this.entries.filter((e) => {
                if (e.name !== name)
                    return false;
                if (source && e.attributes.source !== source)
                    return false;
                return true;
            });
        }
        else {
            filtered = this.entries;
        }
        if (filtered.length === 0)
            return null;
        const durations = filtered.map((e) => e.durationMs).sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        return {
            count: durations.length,
            avg: Math.round((sum / durations.length) * 100) / 100,
            p50: this.percentile(durations, 50),
            p95: this.percentile(durations, 95),
            p99: this.percentile(durations, 99),
            min: Math.round(durations[0] * 100) / 100,
            max: Math.round(durations[durations.length - 1] * 100) / 100,
        };
    }
    percentile(sorted, p) {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return Math.round(sorted[Math.max(0, index)] * 100) / 100;
    }
    printSummary() {
        const keys = this.getOperationKeys();
        if (keys.length === 0) {
            return;
        }
        console.log("\n=== Timing Statistics ===\n");
        console.log("Operation".padEnd(25) +
            "Count".padStart(8) +
            "Avg".padStart(10) +
            "p50".padStart(10) +
            "p95".padStart(10) +
            "p99".padStart(10) +
            "Min".padStart(10) +
            "Max".padStart(10));
        console.log("-".repeat(93));
        for (const key of keys) {
            const stats = this.getStats(key);
            if (!stats)
                continue;
            console.log(key.padEnd(25) +
                String(stats.count).padStart(8) +
                `${stats.avg}ms`.padStart(10) +
                `${stats.p50}ms`.padStart(10) +
                `${stats.p95}ms`.padStart(10) +
                `${stats.p99}ms`.padStart(10) +
                `${stats.min}ms`.padStart(10) +
                `${stats.max}ms`.padStart(10));
        }
        const overall = this.getStats();
        if (overall) {
            console.log("-".repeat(93));
            console.log("TOTAL".padEnd(25) +
                String(overall.count).padStart(8) +
                `${overall.avg}ms`.padStart(10) +
                `${overall.p50}ms`.padStart(10) +
                `${overall.p95}ms`.padStart(10) +
                `${overall.p99}ms`.padStart(10) +
                `${overall.min}ms`.padStart(10) +
                `${overall.max}ms`.padStart(10));
        }
        console.log();
    }
}
/**
 * Create a stats tracer for collecting timing data.
 *
 * Usage:
 * ```ts
 * const { tracer, printStats, clear } = createStatsTracer();
 * const kv = new KV2({ tracer });
 *
 * // ... run operations ...
 *
 * printStats(); // Print timing summary
 * ```
 */
export function createStatsTracer() {
    const collector = new StatsCollector();
    return {
        tracer: {
            startSpan(name, attributes) {
                return new StatsSpan(name, collector, attributes);
            },
        },
        printStats: () => collector.printSummary(),
        clear: () => collector.clear(),
        getStats: (op) => collector.getStats(op),
    };
}
//# sourceMappingURL=tracing.js.map