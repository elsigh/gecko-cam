[Home](../README.md) | [Previous: Iterating and Pagination](iterating-and-pagination.md) | [Next: Optimistic Locking](optimistic-locking.md)

# Typed Stores

## Why Typed Stores?

A bare KV store is untyped — every `get()` returns `unknown` and every `set()` accepts anything. As your app grows you end up with ad-hoc key conventions ("users/" + id, "posts/" + slug) scattered across your codebase and `as User` casts at every call site.

Typed stores solve this by giving you a narrow, strongly-typed view over a slice of your keyspace:

- **Type safety** — `get()` returns `Post`, `set()` only accepts `Post`. No casts, no runtime surprises.
- **Key namespacing** — the store owns its prefix, so you work with short relative keys (`"hello-world"`) instead of full paths (`"posts/hello-world"`).
- **Composability** — stores nest, so you can model `posts/drafts/` or `users/active/` as their own typed sub-stores without any string concatenation.

## Creating a Typed Store

Use `getStore<T>()` to create a type-safe sub-store with automatic key prefixing:

```typescript
interface Post {
  title: string;
  content: string;
}

const posts = kv.getStore<Post>("posts/");

await posts.set("hello-world", { title: "Hello", content: "World" });

const result = await posts.get("hello-world");
if (result.exists) {
  const post = await result.value; // Post
  console.log(post.title);
}

// Or use getValue() for a simpler read
const found = await posts.getValue("hello-world"); // Post | undefined
console.log(found?.title);
```

## Key Prefixing

Keys are relative to the store. The store prepends its prefix automatically, so you never build key strings by hand:

```typescript
const posts = kv.getStore<Post>("posts/");

// You use relative keys
await posts.set("hello-world", { title: "Hello", content: "World" });

for await (const key of posts.keys()) {
  console.log(key); // "hello-world" (not "posts/hello-world")
}
```

## Nested Stores

Stores can be nested. Prefixes accumulate, giving you a natural hierarchy without manual string building:

```typescript
interface Post {
  title: string;
  content: string;
}

const posts = kv.getStore<Post>("posts/");
const drafts = posts.getStore<Post>("drafts/");

await drafts.set("my-draft", { title: "Draft", content: "..." });
// Actual blob path includes: "posts/drafts/my-draft"
```

This lets different parts of your application own their own keyspace — a `drafts` module only sees draft keys and can't accidentally read or overwrite published posts.
