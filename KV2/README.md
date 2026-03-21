# @vercel/kv2 (Under Development)

A type-safe key-value store backed by Vercel Blob with edge caching.

## Installation

```bash
npm install @vercel/kv2
# or
pnpm add @vercel/kv2
```

## Quick Start

```typescript
import { createKV } from "@vercel/kv2";

const kv = createKV({ prefix: "myapp/" });

interface User {
  name: string;
  email: string;
}

const users = kv.getStore<User>("users/");

await users.set("alice", { name: "Alice", email: "alice@example.com" });

const result = await users.get("alice");
if (result.exists) {
  console.log((await result.value).name); // "Alice"
}

// Or use getValue() for a simpler read (returns undefined if not found)
const user = await users.getValue("alice");
console.log(user?.name); // "Alice"

// Delete, iterate keys, entries, getMany — see docs
await users.delete("alice");
```

## Features

| Feature | Description | Docs |
|---------|-------------|------|
| **Typed Stores** | Type-safe sub-stores with automatic key prefixing | [Typed Stores](https://github.com/vercel-labs/KV2/blob/main/docs/typed-stores.md) |
| **Iteration** | `entries()` and `getMany()` with bounded concurrency | [Iterating and Pagination](https://github.com/vercel-labs/KV2/blob/main/docs/iterating-and-pagination.md) |
| **Pagination** | Cursor-based pagination for HTTP APIs | [Iterating and Pagination](https://github.com/vercel-labs/KV2/blob/main/docs/iterating-and-pagination.md) |
| **Optimistic Locking** | Version-based conflict detection and retry | [Optimistic Locking](https://github.com/vercel-labs/KV2/blob/main/docs/optimistic-locking.md) |
| **Metadata** | Typed per-entry metadata, available without loading values | [Metadata](https://github.com/vercel-labs/KV2/blob/main/docs/metadata.md) |
| **Indexes** | Secondary indexes with unique constraints | [Indexes](https://github.com/vercel-labs/KV2/blob/main/docs/indexes.md) |
| **Edge Caching** | Write-through cache with tag invalidation | [Caching](https://github.com/vercel-labs/KV2/blob/main/docs/caching.md) |
| **Streaming** | Large values streamed without buffering | [Streaming](https://github.com/vercel-labs/KV2/blob/main/docs/streaming.md) |
| **CLI Explorer** | Interactive KV store explorer for debugging | [CLI](https://github.com/vercel-labs/KV2/blob/main/docs/cli.md) |

## Documentation

1. [Getting Started](https://github.com/vercel-labs/KV2/blob/main/docs/getting-started.md) — installation, quick start, environment setup
2. [Iterating and Pagination](https://github.com/vercel-labs/KV2/blob/main/docs/iterating-and-pagination.md) — keys, entries, getMany, cursor pagination
3. [Typed Stores](https://github.com/vercel-labs/KV2/blob/main/docs/typed-stores.md) — getStore, key prefixing, nested stores
4. [Optimistic Locking](https://github.com/vercel-labs/KV2/blob/main/docs/optimistic-locking.md) — versions, conflict detection, retry patterns
5. [Metadata](https://github.com/vercel-labs/KV2/blob/main/docs/metadata.md) — typed metadata, filtering without loading values
6. [Indexes](https://github.com/vercel-labs/KV2/blob/main/docs/indexes.md) — secondary indexes, unique constraints, reindexing
7. [Caching](https://github.com/vercel-labs/KV2/blob/main/docs/caching.md) — cache hierarchy, TTL, custom cache
8. [Streaming](https://github.com/vercel-labs/KV2/blob/main/docs/streaming.md) — binary format, large values, streaming reads/writes
9. [Testing and Tracing](https://github.com/vercel-labs/KV2/blob/main/docs/testing-and-tracing.md) — unit testing, tracers, stats
10. [CLI](https://github.com/vercel-labs/KV2/blob/main/docs/cli.md) — interactive KV store explorer
11. [API Reference](https://github.com/vercel-labs/KV2/blob/main/docs/api-reference.md) — full interface and options documentation

## Environment Variables

```
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

See [Getting Started](https://github.com/vercel-labs/KV2/blob/main/docs/getting-started.md) for full environment setup.

## License

ISC
