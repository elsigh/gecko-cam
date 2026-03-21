[Home](../README.md) | [Previous: Getting Started](getting-started.md) | [Next: Typed Stores](typed-stores.md)

# Iterating and Pagination

## Iterating Keys

Use `keys()` to iterate over all keys in a store:

```typescript
for await (const key of users.keys()) {
  console.log(key);
}
```

Filter by prefix:

```typescript
for await (const key of kv.keys("users/active/")) {
  console.log(key);
}
```

## Iterating Entries

`entries()` fetches values concurrently (default: 20 concurrent requests):

```typescript
for await (const [key, entry] of users.entries()) {
  console.log(key, await entry.value);
}
```

With a prefix filter:

```typescript
for await (const [key, entry] of users.entries("active/")) {
  console.log(key, entry.metadata);
}
```

## Fetching Multiple Keys

Use `getMany()` to fetch specific keys with bounded concurrency:

```typescript
const results = await users.getMany(["alice", "bob", "charlie"]);
for (const [key, entry] of results) {
  console.log(key, await entry.value);
}
```

## Deleting During Iteration

It is safe to delete keys while iterating. Iteration uses cursor-based pagination internally, so deleting an already-yielded key does not corrupt the cursor or cause errors.

```typescript
// Delete all entries matching a condition
for await (const key of users.keys()) {
  if (key.startsWith("inactive/")) {
    await users.delete(key);
  }
}
```

**Note:** Keys that haven't been yielded yet may or may not be skipped if deleted — this depends on whether they were part of an already-fetched page. If you need a guarantee that every key is visited exactly once, collect keys first and then delete in a separate loop.

## Cursor-Based Pagination

Both `keys()` and `entries()` support cursor-based pagination for HTTP APIs.

### Paginating Keys

```typescript
const page = await kv.keys("users/").page(10);
console.log(page.keys);     // string[]
console.log(page.cursor);   // string | undefined (pass to next call)
```

### Paginating Entries

```typescript
const page = await kv.entries<User>("users/").page(10);
for (const [key, entry] of page.entries) {
  console.log(key, await entry.value);
}
```

### Next.js API Route Example

```typescript
async function GET(req: Request) {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const { keys, cursor: nextCursor } = await users.keys().page(20, cursor);
  const entries = await users.getMany(keys);

  return Response.json({
    users: await Promise.all(
      keys.map(async (k) => {
        const entry = entries.get(k);
        return entry ? await entry.value : null;
      }),
    ),
    nextCursor,
  });
}
```
