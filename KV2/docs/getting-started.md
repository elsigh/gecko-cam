[Home](../README.md) | [Next: Iterating and Pagination](iterating-and-pagination.md)

# Getting Started

## Installation

```bash
npm install @vercel/kv2
# or
pnpm add @vercel/kv2
```

## Quick Start

```typescript
import { createKV } from "@vercel/kv2";

// Creates KV with automatic environment detection
const kv = createKV({ prefix: "myapp/" });

interface User {
  name: string;
  email: string;
}

// Type-safe sub-store
const users = kv.getStore<User>("users/");

await users.set("alice", { name: "Alice", email: "alice@example.com" });

const result = await users.get("alice");
if (result.exists) {
  console.log((await result.value).name); // "Alice"
}

// Or use getValue() for a simpler read
const user = await users.getValue("alice"); // User | undefined
console.log(user?.name); // "Alice"
```

## Prerequisites

`@vercel/kv2` works out of the box for local development — no token or cloud setup needed. When no `BLOB_READ_WRITE_TOKEN` is found, `createKV()` automatically falls back to disk-based storage at `node_modules/.cache/@vercel/kv2/`.

### Connecting to Vercel Blob (for deployment)

For production and preview deployments, `@vercel/kv2` stores data in a Vercel Private Blob store. Create one with the Vercel CLI:

```bash
# Create a private blob store
vercel blob create-store -a private "my-kv-store"

# Link your project (if not already linked)
vercel link

# Pull the token into .env.local
vercel env pull .env.local
```

This sets the `BLOB_READ_WRITE_TOKEN` environment variable that `@vercel/kv2` uses to connect. On Vercel deployments, the token is automatically available as long as the blob store is linked to your project.

If you want local development to use the same remote blob store instead of disk storage, pull the token with `vercel env pull .env.local`.

## Environment Setup

`@vercel/kv2` uses environment variables for blob access and automatic branch detection:

| Variable | Required | Description |
|----------|----------|-------------|
| `BLOB_READ_WRITE_TOKEN` | On Vercel | Vercel Blob access token. Optional locally — falls back to disk storage. |
| `VERCEL_ENV` | Auto | Set by Vercel (`production`, `preview`, `development`) |
| `VERCEL_GIT_COMMIT_REF` | Auto | Current git branch, set by Vercel |

## How It Works

`@vercel/kv2` stores data as JSON blobs in Vercel Blob storage with an edge cache layer for low-latency reads:

1. **Writes** go directly to Vercel Blob, then invalidate the cache
2. **Reads** check the edge cache first, falling back to Blob storage on cache miss

This gives you strong consistency for writes with fast cached reads.
