[Home](../README.md) | [Previous: Typed Stores](typed-stores.md) | [Next: Metadata](metadata.md)

# Optimistic Locking

## Why Optimistic Locking?

KV stores don't have multi-key transactions the way a SQL database does. If two requests read a value, modify it, and write it back at the same time, one update silently overwrites the other — a lost update.

Optimistic locking prevents this: every entry carries a `version` (an etag). When you write, you can say "only succeed if the version is still what I read." If someone else wrote in between, the store rejects your write with a `KVVersionConflictError` and you retry with fresh data. No locks are held, so throughput stays high — conflicts are detected, not prevented.

## Version-Based Updates

The simplest API is `entry.update()`. It captures the version at read time and passes it through automatically:

```typescript
const entry = await users.get("alice");
if (entry.exists) {
  const user = await entry.value;
  user.name = "Alice Updated";

  // Throws KVVersionConflictError if another process modified it
  await entry.update(user);
}
```

## Transactions via Read-Modify-Write

Because there are no multi-key locks, the pattern for a "transaction" is a retry loop: read the current state, compute the new state, attempt the write, and retry if a conflict is detected. This is safe for any single-key mutation:

```typescript
import { KVVersionConflictError } from "@vercel/kv2";

async function incrementCounter(key: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = await kv.get<{ count: number }>(key);
    if (!entry.exists) throw new Error("Key not found");

    const current = await entry.value;
    try {
      await entry.update({ count: current.count + 1 });
      return current.count + 1;
    } catch (error) {
      if (error instanceof KVVersionConflictError) continue;
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

This is the same approach databases like DynamoDB and CouchDB use for conditional writes. It works well when conflicts are rare (most workloads) and degrades gracefully when they aren't — retries are cheap because reads are cached.

## Manual Version Control

For more control, pass `expectedVersion` in `SetOptions` directly:

```typescript
const { version } = await kv.set("counter", { count: 0 }, metadata);

// Later, conditionally update only if version matches
await kv.set("counter", { count: 1 }, metadata, { expectedVersion: version });
```

This is useful when the version comes from an external source (e.g. a form submission that includes the etag it was editing).

## Create-Only Writes

Use `override: false` to ensure a key is only written if it doesn't already exist — useful for generating unique IDs or claiming resources:

```typescript
await kv.set("user/new-id", userData, metadata, { override: false });
```
