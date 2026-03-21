/**
 * Pluggable tracing system for KV2.
 *
 * Provides a simple span-based API that can be backed by:
 * - Console logging (default for debugging)
 * - No-op (production default)
 * - OpenTelemetry (plug in your own tracer)
 */
import type { Span, Tracer } from "./types.js";
export type { Span, Tracer };
export declare const noopTracer: Tracer;
export declare const consoleTracer: Tracer;
/**
 * Create an OTEL-compatible tracer adapter.
 *
 * Usage with OpenTelemetry:
 * ```ts
 * import { trace } from '@opentelemetry/api';
 *
 * const otelTracer = createOtelTracer(trace.getTracer('kv2'));
 * const kv = new KV2({ tracer: otelTracer });
 * ```
 */
export interface OtelTracerLike {
    startSpan(name: string, options?: {
        attributes?: Record<string, unknown>;
    }): OtelSpanLike;
}
export interface OtelSpanLike {
    setAttribute(key: string, value: unknown): void;
    setStatus(status: {
        code: number;
        message?: string;
    }): void;
    recordException(error: Error): void;
    end(): void;
}
export declare function createOtelTracer(otelTracer: OtelTracerLike): Tracer;
/**
 * Statistics tracer for collecting timing data.
 * Use in integration tests to measure real-world performance.
 */
export interface TimingStats {
    count: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
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
export declare function createStatsTracer(): {
    tracer: Tracer;
    printStats: () => void;
    clear: () => void;
    getStats: (operation?: string) => TimingStats | null;
};
//# sourceMappingURL=tracing.d.ts.map