[Home](../README.md) | [Previous: Copy-on-Write Branches](copy-on-write-branches.md) | [Next: CLI](cli.md)

# Testing and Tracing

## Testing

### Local development

For local development, use a real Vercel Blob store. This ensures your app behaves the same locally as it does in production. See [Getting Started](getting-started.md) for setup instructions — `vercel env pull .env.local` gives you a `BLOB_READ_WRITE_TOKEN` that works locally.

### Unit tests

For unit tests, use `FakeBlobStore` — an in-memory blob store that requires no network calls or tokens:

```typescript
import { FakeBlobStore } from "@vercel/kv2/testing";
import { KV2 } from "@vercel/kv2";

const blobStore = new FakeBlobStore();
const kv = new KV2({ prefix: "test/", blobStore });

await kv.set("key", { hello: "world" });
const result = await kv.get("key");
```

`FakeCache` provides an in-memory cache with call tracking:

```typescript
import { FakeBlobStore, FakeCache } from "@vercel/kv2/testing";
import { KV2 } from "@vercel/kv2";

const blobStore = new FakeBlobStore();
const cache = new FakeCache();
const kv = new KV2({ prefix: "test/", blobStore, cache });
```

Or use `createTestKV` for a one-liner:

```typescript
import { createTestKV } from "@vercel/kv2/testing";

const { kv, blobStore, cleanup } = createTestKV();

await kv.set("key", { hello: "world" });

// Clean up after tests
await cleanup();
```

### Integration tests

To run tests against a real Vercel Blob store, set the environment variables and run:

```bash
INTEGRATION_TEST=1 BLOB_READ_WRITE_TOKEN=vercel_blob_... pnpm test
```

`createTestKV` automatically switches to a real blob store when `INTEGRATION_TEST=1` is set.

## Tracing

### Built-in Tracers

**No-op tracer** — zero overhead, the default:

```typescript
import { noopTracer, KV2 } from "@vercel/kv2";

const kv = new KV2({ prefix: "app/", tracer: noopTracer });
```

**Console tracer** — logs span timing and attributes to console:

```typescript
import { consoleTracer, KV2 } from "@vercel/kv2";

const kv = new KV2({ prefix: "app/", tracer: consoleTracer });
// [KV] kv.get 2.3ms key=users/alice source=blob
```

### OpenTelemetry

Adapt an OpenTelemetry tracer with `createOtelTracer()`:

```typescript
import { createOtelTracer, KV2 } from "@vercel/kv2";

// Provide any OTEL-compatible tracer
const otelTracer: import("@vercel/kv2").OtelTracerLike = {
  startSpan(name, options) {
    return {
      setAttribute() {},
      setStatus() {},
      recordException() {},
      end() {},
    };
  },
};

const tracer = createOtelTracer(otelTracer);
const kv = new KV2({ prefix: "app/", tracer });
```

### Statistics Tracer

Collect timing data for performance analysis:

```typescript
import { createStatsTracer, KV2 } from "@vercel/kv2";

const { tracer, printStats, getStats, clear } = createStatsTracer();
const kv = new KV2({ prefix: "app/", tracer });

// ... run operations ...

// Print a summary table
printStats();

// Get stats for a specific operation
const stats = getStats("kv.get");
if (stats) {
  console.log(`avg: ${stats.avg}ms, p95: ${stats.p95}ms`);
}
```

### Traced Operations

KV2 emits spans for these operations:

| Span Name | Description |
|-----------|-------------|
| `kv.get` | Single key read |
| `kv.set` | Single key write |
| `kv.delete` | Single key delete |
| `kv.keys` | Key listing |
| `kv.entries` | Entry listing |
| `kv.getMany` | Batch read |

Each span includes attributes like `key`, `source` (cache/blob), and `hit` (cache hit/miss).
