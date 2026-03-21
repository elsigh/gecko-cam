[Home](../README.md) | [Previous: Indexes](indexes.md) | [Next: Streaming](streaming.md)

# Caching

## How Caching Works

`@vercel/kv2` uses write-through caching with tag-based invalidation:

1. **On write** — the value is written to Vercel Blob and the cache is invalidated by tag
2. **On read** — the cache is checked first; on cache miss, the value is loaded from Blob and cached

This gives you read-your-writes consistency within a deployment while providing low-latency cached reads across regions.

## Cache Hierarchy

The cache implementation is selected automatically based on the environment:

| Environment | Cache | Notes |
|-------------|-------|-------|
| Vercel Production/Preview | Vercel Runtime Cache | Edge-distributed, tag invalidation |
| Local Development | MemoryCache | In-memory, persists across HMR |
| Integration Tests | ProxyCache | Connects to Vercel cache proxy |

## Configuration

### Cache TTL

Set the cache TTL in seconds (default: 3600):

```typescript
import { createKV } from "@vercel/kv2";

const kv = createKV({
  prefix: "app/",
  cacheTtl: 600, // 10 minutes
});
```

### Custom Cache

Provide a custom `CacheLike` implementation:

```typescript
import { createKV } from "@vercel/kv2";

const kv = createKV({
  prefix: "app/",
  cache: {
    async get(key: string) {
      return null; // custom get
    },
    async set(key: string, value: unknown, options?: { tags?: string[]; ttl?: number }) {
      // custom set
    },
    async expireTag(tag: string) {
      // custom tag invalidation
    },
  },
});
```
