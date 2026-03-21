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

/**
 * No-op tracer for production (zero overhead).
 */
class NoopSpan implements Span {
  setAttributes(): void {}
  setError(): void {}
  end(): void {}
}

const noopSpan = new NoopSpan();

export const noopTracer: Tracer = {
  startSpan(): Span {
    return noopSpan;
  },
};

/**
 * Console logging tracer for debugging.
 * Logs span start, attributes, errors, and duration.
 */
class ConsoleSpan implements Span {
  private name: string;
  private startTime: number;
  private attrs: Record<string, string | number | boolean>;
  private error?: Error;

  constructor(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ) {
    this.name = name;
    this.startTime = performance.now();
    this.attrs = attributes ?? {};
  }

  setAttributes(attrs: Record<string, string | number | boolean>): void {
    Object.assign(this.attrs, attrs);
  }

  setError(error: Error): void {
    this.error = error;
  }

  end(): void {
    const duration = performance.now() - this.startTime;
    const attrs = Object.entries(this.attrs)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");

    if (this.error) {
      console.log(
        `[KV] ${this.name} FAILED ${duration.toFixed(1)}ms ${attrs} error=${this.error.message}`,
      );
    } else {
      console.log(`[KV] ${this.name} ${duration.toFixed(1)}ms ${attrs}`);
    }
  }
}

export const consoleTracer: Tracer = {
  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): Span {
    return new ConsoleSpan(name, attributes);
  },
};

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
  startSpan(
    name: string,
    options?: { attributes?: Record<string, unknown> },
  ): OtelSpanLike;
}

export interface OtelSpanLike {
  setAttribute(key: string, value: unknown): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(error: Error): void;
  end(): void;
}

export function createOtelTracer(otelTracer: OtelTracerLike): Tracer {
  return {
    startSpan(
      name: string,
      attributes?: Record<string, string | number | boolean>,
    ): Span {
      const span = otelTracer.startSpan(name, { attributes });
      return {
        setAttributes(attrs: Record<string, string | number | boolean>): void {
          for (const [key, value] of Object.entries(attrs)) {
            span.setAttribute(key, value);
          }
        },
        setError(error: Error): void {
          span.setStatus({ code: 2, message: error.message }); // OTEL SpanStatusCode.ERROR = 2
          span.recordException(error);
        },
        end(): void {
          span.end();
        },
      };
    },
  };
}

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

interface TimingEntry {
  name: string;
  durationMs: number;
  attributes: Record<string, string | number | boolean>;
  error?: string;
}

class StatsSpan implements Span {
  private name: string;
  private startTime: number;
  private attrs: Record<string, string | number | boolean>;
  private error?: Error;
  private collector: StatsCollector;

  constructor(
    name: string,
    collector: StatsCollector,
    attributes?: Record<string, string | number | boolean>,
  ) {
    this.name = name;
    this.startTime = performance.now();
    this.attrs = attributes ?? {};
    this.collector = collector;
  }

  setAttributes(attrs: Record<string, string | number | boolean>): void {
    Object.assign(this.attrs, attrs);
  }

  setError(error: Error): void {
    this.error = error;
  }

  end(): void {
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
  private entries: TimingEntry[] = [];

  record(entry: TimingEntry): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries = [];
  }

  /** Get unique operation keys (name + source) */
  getOperationKeys(): string[] {
    const keys = new Set<string>();
    for (const e of this.entries) {
      const source = e.attributes.source as string | undefined;
      const key = source ? `${e.name}:${source}` : e.name;
      keys.add(key);
    }
    return [...keys].sort();
  }

  getStats(operationKey?: string): TimingStats | null {
    let filtered: TimingEntry[];

    if (operationKey) {
      const [name, source] = operationKey.includes(":")
        ? operationKey.split(":")
        : [operationKey, undefined];

      filtered = this.entries.filter((e) => {
        if (e.name !== name) return false;
        if (source && e.attributes.source !== source) return false;
        return true;
      });
    } else {
      filtered = this.entries;
    }

    if (filtered.length === 0) return null;

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

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, index)] * 100) / 100;
  }

  printSummary(): void {
    const keys = this.getOperationKeys();
    if (keys.length === 0) {
      return;
    }

    console.log("\n=== Timing Statistics ===\n");
    console.log(
      "Operation".padEnd(25) +
        "Count".padStart(8) +
        "Avg".padStart(10) +
        "p50".padStart(10) +
        "p95".padStart(10) +
        "p99".padStart(10) +
        "Min".padStart(10) +
        "Max".padStart(10),
    );
    console.log("-".repeat(93));

    for (const key of keys) {
      const stats = this.getStats(key);
      if (!stats) continue;

      console.log(
        key.padEnd(25) +
          String(stats.count).padStart(8) +
          `${stats.avg}ms`.padStart(10) +
          `${stats.p50}ms`.padStart(10) +
          `${stats.p95}ms`.padStart(10) +
          `${stats.p99}ms`.padStart(10) +
          `${stats.min}ms`.padStart(10) +
          `${stats.max}ms`.padStart(10),
      );
    }

    const overall = this.getStats();
    if (overall) {
      console.log("-".repeat(93));
      console.log(
        "TOTAL".padEnd(25) +
          String(overall.count).padStart(8) +
          `${overall.avg}ms`.padStart(10) +
          `${overall.p50}ms`.padStart(10) +
          `${overall.p95}ms`.padStart(10) +
          `${overall.p99}ms`.padStart(10) +
          `${overall.min}ms`.padStart(10) +
          `${overall.max}ms`.padStart(10),
      );
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
export function createStatsTracer(): {
  tracer: Tracer;
  printStats: () => void;
  clear: () => void;
  getStats: (operation?: string) => TimingStats | null;
} {
  const collector = new StatsCollector();

  return {
    tracer: {
      startSpan(
        name: string,
        attributes?: Record<string, string | number | boolean>,
      ): Span {
        return new StatsSpan(name, collector, attributes);
      },
    },
    printStats: () => collector.printSummary(),
    clear: () => collector.clear(),
    getStats: (op?: string) => collector.getStats(op),
  };
}
