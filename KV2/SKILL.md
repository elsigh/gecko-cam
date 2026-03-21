# Using @vercel/kv2

## Getting started

Read the README for a quick overview and code examples:

```
node_modules/@vercel/kv2/README.md
```

## Usage patterns

### Use typed stores, not raw KV

Always use `kv.getStore<V>(prefix)` rather than `kv.get`/`kv.set` directly. Typed stores enforce value types, scope keys by prefix, and support indexes.

```typescript
const kv = createKV({ prefix: "myapp/" });
const users = kv.getStore<User>("users/");
await users.set("alice", { name: "Alice", email: "alice@example.com" });
```

### Reading values

For simple reads where you just need the value, use `getValue()` — it returns `V | undefined`:

```typescript
const user = await users.getValue("alice");
if (user) {
  console.log(user.name);
}
```

When you need metadata, version, stream, or `update()`, use `get()` — it returns a discriminated union:

```typescript
const result = await users.get("alice");
if (result.exists) {
  const user = await result.value;  // Promise<User>, not User
  console.log(user.name, result.metadata);
}
```

### Indexes

Define indexes in `getStore()` to enable lookups by secondary keys. Use `defineIndexes<V>()` to let TypeScript infer index names automatically:

```typescript
import { defineIndexes } from "@vercel/kv2";

const users = kv.getStore("users/", defineIndexes<User>()({
  byEmail: { key: (u) => u.email, unique: true },
  byRole:  { key: (u) => u.role },
}));

// Exact match on unique index — returns single result
const result = await users.get({ byEmail: "alice@example.com" });

// Exact match on non-unique index — iterate multiple results
for await (const key of users.keys({ byRole: "admin" })) { ... }

// Prefix scan — sorted iteration over a range
for await (const [key, entry] of users.entries({ byRole: { prefix: "admin" } })) { ... }

// Empty prefix — all entries sorted by index key
for await (const key of users.keys({ byRole: { prefix: "" } })) { ... }
```

Composite index keys enable "group by X, sort by Y" patterns. Use `/` separators between fields and invert values for descending order (see `docs/indexes.md` for details).

```typescript
const MAX_TS = 8_640_000_000_000;
const sessions = kv.getStore<Session, undefined, "byUserNewest">("sessions/", {
  byUserNewest: {
    key: (s) => `${s.userId}/${String(MAX_TS - Date.parse(s.createdAt)).padStart(14, "0")}`,
  },
});
// user-42's most recent sessions first
sessions.entries({ byUserNewest: { prefix: "user-42/" } })
```

### Iteration and pagination

```typescript
// Async iteration
for await (const [key, entry] of users.entries()) {
  console.log(key, await entry.value);
}

// Cursor-based pagination
const page1 = await users.keys().page(20);
const page2 = await users.keys().page(20, page1.cursor);
```

### Safe updates with optimistic locking

Use `entry.update()` to do read-modify-write with automatic version checking. Throws `KVVersionConflictError` on conflict.

```typescript
const result = await users.get("alice");
if (result.exists) {
  const user = await result.value;
  await result.update({ ...user, role: "admin" });
}
```

## Docs

Detailed documentation is available in the package's `docs/` directory. Read files as needed from `node_modules/@vercel/kv2/docs/`:

| File | Topics |
|------|--------|
| `getting-started.md` | Installation, prerequisites, environment variables (`BLOB_READ_WRITE_TOKEN`), how edge caching and CoW branching work |
| `typed-stores.md` | `getStore<V>()`, type-safe values, automatic key prefixing, nested/hierarchical stores |
| `iterating-and-pagination.md` | `keys()`, `entries()`, `getMany()`, prefix filtering, cursor-based `page()` pagination, Next.js API route example |
| `optimistic-locking.md` | Versions/etags, `entry.update()`, read-modify-write retry loops, `expectedVersion`, create-only writes (`override: false`) |
| `metadata.md` | Typed per-entry metadata via `createKV<M>()`, metadata inheritance in sub-stores, filtering by metadata without loading values |
| `schema-and-trees.md` | `defineSchema()`, `createSchemaKV()`, hierarchical entity models, type-safe key builders, `tree()` loading with lazy children |
| `indexes.md` | Defining indexes, unique constraints (`KVIndexConflictError`), multi-value indexes (arrays), prefix queries for sorted iteration, composite index keys (group + sort), key design (padding, DESC via inverted keys, separators), `reindex()`, orphan self-healing |
| `caching.md` | Write-through caching, tag-based invalidation, cache hierarchy (Runtime Cache, MemoryCache, ProxyCache), TTL configuration |
| `streaming.md` | `result.stream` for large value reads, `ReadableStream` writes, binary format, `largeValueThreshold` (default 1MB) |
| `copy-on-write-branches.md` | Preview branch data isolation, virtual forking with upstream fallback, tombstones, automatic environment detection, ManifestLog, branch name encoding |
| `testing-and-tracing.md` | `InMemoryBlobStore` for unit tests, integration tests with `INTEGRATION_TEST=1`, tracers: no-op, console, OpenTelemetry (`createOtelTracer`), stats (`createStatsTracer`) |
| `cli.md` | `kv2` CLI: `keys`, `get`, `set`, `del` commands, `--prefix`/`--env`/`--branch` options, interactive REPL, stdout/stderr contract for piping |
| `api-reference.md` | Full API: `createKV()`, `KVLike`, `KVGetResult`, `SetOptions`, `TypedKV`, `KV2`, `UpstreamKV`, `SchemaKV`, `KeysIterable`, `EntriesIterable`, error classes, environment variables |

## Types

All public types and interfaces are exported from the main entry point. To look up type signatures, read:

```
node_modules/@vercel/kv2/dist/index.d.ts
```

Key type definition files in `node_modules/@vercel/kv2/dist/`:

| File | Types |
|------|-------|
| `types.d.ts` | `KVLike`, `KVEntry`, `KVGetResult`, `KVSetResult`, `KeysIterable`, `KeysPage`, `EntriesIterable`, `SetOptions`, `BlobStore`, `Tracer` |
| `cached-kv.d.ts` | `KV2` class |
| `typed-kv.d.ts` | `TypedKV` class, `IndexDef`, `IndexQuery`, `IndexQueryValue` |
| `create-kv.d.ts` | `createKV()`, `CreateKVOptions`, `UpstreamConfig` |
| `upstream-kv.d.ts` | `UpstreamKV` class |
| `manifest-log.d.ts` | `ManifestLog`, `KeyMeta` |
| `tracing.d.ts` | Tracer factories, `TimingStats` |
| `schema/index.d.ts` | `defineSchema`, `createSchemaKV`, `SchemaKV`, `TreeNode` |

## Verifying KV state

The package ships a `kv2` CLI for inspecting and debugging the KV store:

```bash
npx kv2 keys                          # List keys (first 100)
npx kv2 --all keys                    # List all keys
npx kv2 get <key>                     # Print a value as JSON
npx kv2 --verbose get <key>           # Also show version and metadata
npx kv2 --allow-writes set <key> <json>  # Write a value
npx kv2 --allow-writes del <key>      # Delete a key
```

Use `--prefix <prefix>` if your app uses `createKV({ prefix: "myapp/" })`.
