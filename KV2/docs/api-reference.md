[Home](../README.md) | [Previous: CLI](cli.md)

# API Reference

## `createKV<M>(options)`

Creates a KV store with automatic environment detection.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `string` | `""` | Key prefix for namespacing |
| `env` | `string` | `VERCEL_ENV` | Environment name |
| `branch` | `string` | `VERCEL_GIT_COMMIT_REF` | Branch name |
| `token` | `string` | `BLOB_READ_WRITE_TOKEN` | Blob access token. When absent locally, falls back to disk storage. |
| `blobStore` | `BlobStore` | `VercelBlobStore` | Custom blob store. Auto-falls back to `DiskBlobStore` when no token is available locally. |
| `cache` | `CacheLike` | auto-detected | Custom cache implementation |
| `cacheTtl` | `number` | `3600` | Cache TTL in seconds |
| `largeValueThreshold` | `number` | `1048576` | Byte threshold for binary format |
| `tracer` | `Tracer` | `noopTracer` | Custom tracer |

Returns `KV2<M>`.

## `KVLike<M>` Interface

All stores (`KV2`, `TypedKV`) implement this interface:

```typescript
interface KVLike<M> {
  get<V>(key: string): Promise<KVGetResult<V, M>>;
  getValue<V>(key: string): Promise<V | undefined>;
  set<V>(key: string, value: V | ReadableStream<Uint8Array>, metadata?: M, options?: SetOptions): Promise<KVSetResult>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): KeysIterable;
  entries<V>(prefix?: string): EntriesIterable<V, M>;
  getMany<V>(keys: string[], concurrency?: number): Promise<Map<string, KVEntry<V, M>>>;
}
```

### `getValue<V>(key): Promise<V | undefined>`

Convenience method that returns the parsed value directly, or `undefined` if the key does not exist. Equivalent to calling `get()`, checking `exists`, and awaiting `value`.

Use `getValue()` when you only need the value. Use `get()` when you need metadata, version, stream, or `update()`.

```typescript
const user = await users.getValue("alice");
if (user) {
  console.log(user.name);
}
```

**Note:** `undefined` is never a valid stored value (set rejects it), so `undefined` unambiguously means "not found".

## `KVGetResult<V, M>`

A discriminated union — check `exists` before accessing properties:

```typescript
const result = await kv.get<User>("key");
if (result.exists) {
  result.metadata;     // M — immediately available
  result.version;      // string — etag for optimistic locking
  await result.value;  // V — lazy-loaded
  await result.stream; // ReadableStream<Uint8Array>
  await result.update(newValue); // conditional write
}
```

### Properties (when `exists: true`)

| Property | Type | Description |
|----------|------|-------------|
| `exists` | `true` | Entry found |
| `metadata` | `M` | Entry metadata (immediate) |
| `version` | `string` | Etag for optimistic locking |
| `value` | `Promise<V>` | Lazily parsed value |
| `stream` | `Promise<ReadableStream<Uint8Array>>` | Raw byte stream |
| `update(value, metadata?)` | `Promise<KVSetResult>` | Conditional update using captured version |

### Properties (when `exists: false`)

| Property | Type | Description |
|----------|------|-------------|
| `exists` | `false` | Entry not found |
| `metadata` | `undefined` | |
| `value` | `undefined` | |
| `stream` | `undefined` | |

## `SetOptions`

```typescript
interface SetOptions {
  expectedVersion?: string;  // Only succeed if current version matches
  override?: boolean;        // Allow overwriting (default: true)
}
```

## `KVSetResult`

```typescript
interface KVSetResult {
  version: string;  // etag of the written blob
}
```

## `KeysIterable`

```typescript
interface KeysIterable extends AsyncIterable<string> {
  page(limit: number, cursor?: string): Promise<KeysPage>;
}

interface KeysPage {
  keys: string[];
  cursor?: string;
}
```

## `EntriesIterable<V, M>`

```typescript
interface EntriesIterable<V, M> extends AsyncIterable<[string, KVEntry<V, M>]> {
  page(limit: number, cursor?: string): Promise<EntriesPage<V, M>>;
}

interface EntriesPage<V, M> {
  entries: [string, KVEntry<V, M>][];
  cursor?: string;
}
```

## `TypedKV<V, M, I>`

A typed sub-store with automatic key prefixing and optional secondary indexes.

```typescript
// Create from any KV
const users = kv.getStore<User>("users/");

// With indexes
const docs = kv.getStore<Doc, undefined, "bySlug">("docs/", {
  bySlug: { key: (doc) => doc.slug, unique: true },
});
```

### Methods

All `KVLike<M>` methods plus:

| Method | Description |
|--------|-------------|
| `getStore<V, M, I>(prefix, indexes?)` | Create a nested sub-store |
| `reindex(indexName?)` | Rebuild one or all secondary indexes |
| `get(indexQuery)` | Look up by index (unique indexes) |
| `getValue(keyOrIndexQuery)` | Get value by key or unique index, returns `undefined` if not found |
| `keys(indexQuery)` | List keys matching an index query |
| `entries(indexQuery)` | List entries matching an index query |

## `defineIndexes<V>()`

Helper that lets TypeScript infer index names from an object literal, so you don't need to spell out `"byA" | "byB"` as a type parameter.

```typescript
import { defineIndexes } from "@vercel/kv2";

const users = kv.getStore("users/", defineIndexes<User>()({
  byEmail: { key: (u) => u.email, unique: true },
  byRole:  { key: (u) => u.role },
}));
// TypeScript infers "byEmail" | "byRole" automatically
```

## `KV2<M>`

The core cached KV implementation. Implements `KVLike<M>` plus:

| Method | Description |
|--------|-------------|
| `getStore<V, M, I>(prefix, indexes?)` | Create a typed sub-store |

### Constructor Options (`KV2Options`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prefix` | `PrefixString` | `""` | Global key prefix |
| `token` | `string` | `BLOB_READ_WRITE_TOKEN` | Blob access token |
| `largeValueThreshold` | `number` | `1048576` | Binary format threshold (bytes) |
| `cacheTtl` | `number` | `3600` | Cache TTL (seconds) |
| `blobStore` | `BlobStore` | `VercelBlobStore` | Blob storage backend |
| `cache` | `CacheLike` | auto-detected | Cache backend |
| `tracer` | `Tracer` | `noopTracer` | Tracing backend |

## Error Classes

### `KVVersionConflictError`

Thrown when a conditional update fails because the entry was modified by another process.

```typescript
import { KVVersionConflictError } from "@vercel/kv2";

try {
  await entry.update(newValue);
} catch (error) {
  if (error instanceof KVVersionConflictError) {
    // Retry the read-modify-write cycle
  }
}
```

### `KVIndexConflictError`

Thrown when a unique index constraint is violated.

```typescript
import { KVIndexConflictError } from "@vercel/kv2";

try {
  await docs.set("doc-2", docData);
} catch (error) {
  if (error instanceof KVIndexConflictError) {
    console.log(error.indexName); // e.g. "bySlug"
    console.log(error.indexKey);  // the conflicting key
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | On Vercel | Vercel Blob access token. Optional locally — `createKV()` falls back to disk storage. |
| `VERCEL_ENV` | Auto | `production`, `preview`, or `development` |
| `VERCEL_GIT_COMMIT_REF` | Auto | Current git branch |
| `PROTECTION_BYPASS` | Integration tests | Protection bypass token |
