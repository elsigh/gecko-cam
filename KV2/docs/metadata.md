[Home](../README.md) | [Previous: Optimistic Locking](optimistic-locking.md) | [Next: Schema and Trees](schema-and-trees.md)

# Metadata

## Typed Metadata

Parameterize `createKV<M>()` with a metadata type. Metadata is stored alongside each entry and is available immediately (no lazy loading):

```typescript
import { createKV } from "@vercel/kv2";

interface Metadata {
  updatedAt: number;
  version: number;
}

interface User {
  name: string;
  email: string;
}

const kv = createKV<Metadata>({ prefix: "app/" });
const users = kv.getStore<User>("users/");

// Metadata is required on set
await users.set("alice", { name: "Alice", email: "alice@example.com" }, { updatedAt: Date.now(), version: 1 });

const result = await users.get("alice");
if (result.exists) {
  console.log(result.metadata.version); // 1 — available immediately
  console.log((await result.value).name); // "Alice" — lazy loaded
}
```

## Metadata on Sub-Stores

Sub-stores inherit the metadata type from their parent:

```typescript
import { createKV } from "@vercel/kv2";

interface Metadata {
  updatedAt: number;
  version: number;
}

interface Post {
  title: string;
  content: string;
}

const kv = createKV<Metadata>({ prefix: "app/" });
const posts = kv.getStore<Post>("posts/");

// Same metadata type required
await posts.set("hello", { title: "Hello", content: "World" }, { updatedAt: Date.now(), version: 1 });
```

## Metadata Without Values

Since metadata is available without loading the value, you can filter entries efficiently:

```typescript
import { createKV } from "@vercel/kv2";

interface Metadata {
  updatedAt: number;
  version: number;
}

const kv = createKV<Metadata>({ prefix: "app/" });

// Iterate entries and inspect metadata before deciding to load the value
for await (const [key, entry] of kv.entries("posts/")) {
  // metadata is immediately available
  if (entry.metadata.updatedAt > Date.now() - 86400_000) {
    // Only load the value for recent entries
    const value = await entry.value;
    console.log(key, value);
  }
}
```
