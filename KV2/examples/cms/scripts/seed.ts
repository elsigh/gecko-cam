#!/usr/bin/env tsx
import dotenv from "dotenv";

// Determine environment from CLI args or env var
const args = process.argv.slice(2);
const isProduction = args.includes("--production") || args.includes("-p") || process.env.SEED_ENV === "production";
const skipConfirm = args.includes("--yes") || args.includes("-y");

// Load appropriate env file
if (isProduction) {
  // For production, try .env.production.local first, then .env.production, then rely on env vars
  dotenv.config({ path: ".env.production.local" });
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config({ path: ".env.local" });
}

// Verify we have required env vars
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Error: BLOB_READ_WRITE_TOKEN is not set.");
  console.error(isProduction
    ? "Set it in .env.production.local, .env.production, or as an environment variable."
    : "Set it in .env.local or as an environment variable.");
  process.exit(1);
}

// Dynamic imports after env is loaded
const { createUser, getUserByUsername } = await import("../lib/users");
const { createDocument, getDocumentBySlug } = await import("../lib/documents");

// Environment variables for admin user
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";

// Production safety check
if (isProduction && !skipConfirm) {
  console.log("\n⚠️  WARNING: You are about to seed PRODUCTION data.\n");
  console.log("This will create:");
  console.log("  - Admin user (if not exists)");
  console.log("  - Sample pages, docs, and changelogs (if not exist)");
  console.log("");
  console.log("BLOB_READ_WRITE_TOKEN:", process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 20) + "...");
  console.log("");

  // Simple confirmation for production
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Type 'yes' to continue: ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }
  console.log("");
}

async function seedAdmin() {
  console.log("Checking for existing admin user...");

  const existingUser = await getUserByUsername(ADMIN_USERNAME);
  if (existingUser) {
    console.log(`Admin user "${ADMIN_USERNAME}" already exists, skipping.`);
    return existingUser.id;
  }

  console.log(`Creating admin user "${ADMIN_USERNAME}"...`);
  const user = await createUser({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: "admin",
  });

  console.log(`Admin user created with ID: ${user.id}`);
  return user.id;
}

async function seedDocument(
  userId: string,
  slug: string,
  data: {
    type: string;
    title: string;
    body: string;
    status: "draft" | "published" | "archived";
    urls?: string[];
  }
) {
  const existing = await getDocumentBySlug(slug);
  if (existing) {
    console.log(`Document "${slug}" already exists, skipping.`);
    return;
  }

  console.log(`Creating document "${slug}"...`);
  await createDocument(
    {
      type: data.type,
      title: data.title,
      slug,
      body: data.body,
      status: data.status,
      urls: data.urls ?? [],
      author: userId,
    },
    userId
  );
  console.log(`Document "${slug}" created.`);
}

// =============================================================================
// PAGE CONTENT
// =============================================================================

const homePageContent = `
**The next-generation key-value store for the edge.**

Vercel KV2 (powered by KV2) delivers blazing-fast reads with automatic regional caching, type-safe APIs, and seamless Vercel Blob integration.

## Why KV2?

### Lightning Fast Reads
Regional caching ensures sub-10ms reads from the edge. Your data is cached close to your users, automatically.

### Type-Safe by Default
Full TypeScript support with typed stores, metadata, and entries. Catch errors at compile time, not runtime.

### Built for Scale
From prototype to production, KV2 handles millions of keys with efficient pagination and streaming support.

## Quick Start

\`\`\`typescript
import { createKV } from "@vercel/kv2";

// Create a typed KV store
const kv = createKV({ prefix: "app/" });
const usersKV = kv.getStore<User, UserMeta>("users/");

// Set with metadata
await usersKV.set("alice", userData, { role: "admin" });

// Get returns both value and metadata
const { value, metadata } = await usersKV.get("alice");
\`\`\`

## Features

| Feature | Description |
|---------|-------------|
| **Regional Caching** | Automatic edge caching with configurable TTL |
| **Typed Stores** | Full TypeScript support with generics |
| **Metadata** | Store structured metadata alongside values |
| **Pagination** | Cursor-based pagination for large datasets |
| **Streaming** | Stream large values without memory pressure |
`;

const aboutPageContent = `
Vercel KV2 represents the next evolution of key-value storage for modern web applications.

## Our Mission

Build the fastest, most developer-friendly key-value store for the edge. We believe data access should be:

- **Fast** - Sub-10ms reads from anywhere in the world
- **Simple** - Intuitive APIs that just work
- **Safe** - Type-safe by default, errors caught at compile time
- **Scalable** - From side project to enterprise, without config changes

## Built on Vercel

KV2 is built on top of Vercel's infrastructure:

- **Vercel Blob** - Durable object storage
- **Edge Network** - Global distribution with 100+ edge locations
- **Edge Functions** - Compute close to your users

## Open Source

KV2 is open source and welcomes contributions. Visit our GitHub repository to report issues, request features, and submit pull requests.
`;

// =============================================================================
// DOCUMENTATION CONTENT (type: "doc")
// =============================================================================

const docsOverviewContent = `
Welcome to the Vercel KV2 documentation. Learn how to build fast, type-safe applications with our next-generation key-value store.

## What is KV2?

KV2 is a type-safe key-value store built on Vercel Blob with automatic edge caching. It provides:

- **Simple API** - Just \`get\`, \`set\`, \`delete\`, and \`entries\`
- **Type Safety** - Full TypeScript support with generics
- **Edge Caching** - Automatic regional caching for fast reads
- **Metadata** - Store structured metadata alongside values

## Quick Links

- [Installation](/docs/installation) - Get started in minutes
- [Basic Usage](/docs/basic-usage) - Learn the core API
- [Pagination](/docs/pagination) - Handle large datasets
- [Configuration](/docs/configuration) - Customize behavior
`;

const docsInstallationContent = `
Get started with KV2 in your project.

## Installation

\`\`\`bash
npm install kv
# or
pnpm add kv
# or
yarn add kv
\`\`\`

## Environment Setup

Create a Vercel Blob store in your Vercel dashboard, then add the token to your environment:

\`\`\`bash
# .env.local
BLOB_READ_WRITE_TOKEN=vercel_blob_xxx
\`\`\`

## Verify Installation

\`\`\`typescript
import { createKV } from "@vercel/kv2";

const kv = createKV({ prefix: "test/" });

// Test write
await kv.set("hello", "world");

// Test read
const { value } = await kv.get("hello");
console.log(value); // "world"
\`\`\`

## Requirements

- Node.js 18 or later
- A Vercel account with Blob storage enabled
`;

const docsBasicUsageContent = `
Learn the core KV2 API for storing and retrieving data.

## Creating a Store

\`\`\`typescript
import { createKV } from "@vercel/kv2";

const kv = createKV({ prefix: "myapp/" });
\`\`\`

## Typed Sub-Stores

Create typed sub-stores for different data types:

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

interface UserMeta {
  createdAt: number;
  updatedAt: number;
}

const usersKV = kv.getStore<User, UserMeta>("users/");
\`\`\`

## Basic Operations

### Set a Value

\`\`\`typescript
await usersKV.set("user-123", {
  id: "user-123",
  name: "Alice",
  email: "alice@example.com",
}, {
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
\`\`\`

### Get a Value

\`\`\`typescript
const result = await usersKV.get("user-123");
if (result.exists) {
  const user = await result.value;
  console.log(user.name); // "Alice"
  console.log(result.metadata?.createdAt);
}
\`\`\`

### Delete a Value

\`\`\`typescript
await usersKV.delete("user-123");
\`\`\`
`;

const docsPaginationContent = `
Handle large datasets efficiently with cursor-based pagination.

## Async Iteration

Iterate over all entries using \`for await...of\`:

\`\`\`typescript
// Iterate over all keys
for await (const key of usersKV.keys()) {
  console.log(key);
}

// Iterate over all entries
for await (const [key, entry] of usersKV.entries()) {
  const value = await entry.value;
  console.log(key, value, entry.metadata);
}
\`\`\`

## Cursor-Based Pagination

For API endpoints, use cursor-based pagination:

\`\`\`typescript
// Get first page
const page1 = await usersKV.entries().page(10);
console.log(page1.entries); // First 10 entries
console.log(page1.cursor);  // Cursor for next page

// Get next page
if (page1.cursor) {
  const page2 = await usersKV.entries().page(10, page1.cursor);
}
\`\`\`

## Prefix Filtering

Filter entries by prefix:

\`\`\`typescript
// Only get entries starting with "admin/"
for await (const [key, entry] of usersKV.entries("admin/")) {
  console.log(key);
}
\`\`\`

## Best Practices

1. **Use pagination for APIs** - Don't load all entries at once
2. **Set reasonable page sizes** - 10-50 items per page
3. **Use prefix filtering** - Narrow down results when possible
`;

const docsConfigurationContent = `
Customize KV2 behavior with configuration options.

## Cache Options

\`\`\`typescript
const kv = createKV({
  prefix: "myapp/",
  cache: {
    ttl: 60_000,        // Cache TTL in milliseconds (default: 60s)
    maxSize: 1000,      // Max entries in cache
    staleWhileRevalidate: true,
  },
});
\`\`\`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| \`BLOB_READ_WRITE_TOKEN\` | Vercel Blob access token | Required |
| \`KV_CACHE_TTL\` | Default cache TTL (ms) | 60000 |

## Nested Stores

Create hierarchical data structures:

\`\`\`typescript
const boardsKV = kv.getStore<Board>("boards/");
const columnsKV = boardsKV.getStore<Column>("columns/");

// Keys are automatically prefixed
// columnsKV.set("col-1", data) -> "myapp/boards/columns/col-1"
\`\`\`

## Disabling Cache

For real-time data, disable caching:

\`\`\`typescript
const realtimeKV = createKV({
  prefix: "realtime/",
  cache: false,
});
\`\`\`
`;

// =============================================================================
// CHANGELOG CONTENT (type: "changelog")
// =============================================================================

const changelog100Content = `
The first stable release of Vercel KV2 is here!

## Features

- **Type-Safe Stores** - Full TypeScript support with generics for values and metadata
- **Regional Caching** - Automatic edge caching with configurable TTL
- **Cursor Pagination** - Efficient iteration over large datasets
- **Streaming Support** - Handle large values without memory pressure
- **Batch Operations** - \`getMany\` for efficient multi-key retrieval

## API

- \`createKV(options)\` - Create a new KV instance
- \`kv.getStore<V, M>(prefix)\` - Create typed sub-stores
- \`store.get(key)\` - Get value and metadata
- \`store.set(key, value, metadata?)\` - Set value with optional metadata
- \`store.delete(key)\` - Delete a key
- \`store.keys(prefix?)\` - Iterate over keys
- \`store.entries(prefix?)\` - Iterate over entries
- \`store.getMany(keys)\` - Batch get multiple keys

## Migration from Vercel KV

\`\`\`typescript
// Before (Vercel KV)
import { kv } from "@vercel/kv";
await kv.set("key", value);
const result = await kv.get("key");

// After (KV2)
import { createKV } from "@vercel/kv2";
const kv = createKV({ prefix: "app/" });
await kv.set("key", value);
const { value } = await kv.get("key");
\`\`\`
`;

const changelog090Content = `
Beta release with improved stability and new features.

## Features

- **Vercel Blob Backend** - Now powered by Vercel Blob for reliable storage
- **Prefix-Based Organization** - Hierarchical key organization
- **Improved TypeScript** - Better type inference for nested stores

## Improvements

- Improved error messages with actionable guidance
- Better TypeScript inference for nested stores
- Reduced memory footprint for large iterations

## Bug Fixes

- Fixed cursor pagination edge cases with empty results
- Resolved memory leak in long-running iterations
- Fixed race condition in cache invalidation

## Breaking Changes

- \`store.get()\` now returns \`{ exists, value, metadata }\` instead of just value
- Removed deprecated \`store.list()\` method (use \`store.entries()\`)
`;

const changelog080Content = `
Initial alpha release for early adopters.

## Features

- **Core API** - Basic get/set/delete operations
- **Async Iteration** - Support for \`for await...of\`
- **TypeScript Support** - Basic type definitions

## Known Issues

- Cache invalidation may be delayed in some regions
- Large value streaming not yet optimized
- Limited error messages

## Feedback

This is an alpha release. Please report any issues on GitHub.
`;

const changelog110Content = `
Performance improvements and new features.

## Features

- **Batch Delete** - Delete multiple keys in one operation
- **Key Exists** - Check if a key exists without fetching value
- **Improved Caching** - Smarter cache invalidation

## New API

\`\`\`typescript
// Batch delete
await store.deleteMany(["key1", "key2", "key3"]);

// Check existence
const exists = await store.has("key");
\`\`\`

## Performance

- 40% faster cache lookups
- 60% reduction in memory usage for iterations
- Improved cold start times

## Bug Fixes

- Fixed edge case with unicode keys
- Resolved timeout issues with large batch operations
`;

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seed() {
  const envLabel = isProduction ? "PRODUCTION" : "development";
  console.log(`Starting seed process (${envLabel})...\n`);

  // Create admin user
  const adminId = await seedAdmin();
  console.log("");

  // Seed pages
  console.log("Seeding pages...");
  await seedDocument(adminId, "home", {
    type: "page",
    title: "Vercel KV2",
    body: homePageContent.trim(),
    status: "published",
    urls: ["/", "/index"],
  });

  await seedDocument(adminId, "about", {
    type: "page",
    title: "About Vercel KV2",
    body: aboutPageContent.trim(),
    status: "published",
  });

  // Seed documentation (type: "doc")
  console.log("\nSeeding documentation...");
  await seedDocument(adminId, "docs", {
    type: "doc",
    title: "Documentation",
    body: docsOverviewContent.trim(),
    status: "published",
    urls: ["/documentation"],
  });

  await seedDocument(adminId, "docs/installation", {
    type: "doc",
    title: "Installation",
    body: docsInstallationContent.trim(),
    status: "published",
  });

  await seedDocument(adminId, "docs/basic-usage", {
    type: "doc",
    title: "Basic Usage",
    body: docsBasicUsageContent.trim(),
    status: "published",
  });

  await seedDocument(adminId, "docs/pagination", {
    type: "doc",
    title: "Pagination",
    body: docsPaginationContent.trim(),
    status: "published",
  });

  await seedDocument(adminId, "docs/configuration", {
    type: "doc",
    title: "Configuration",
    body: docsConfigurationContent.trim(),
    status: "published",
  });

  // Seed changelogs (type: "changelog")
  console.log("\nSeeding changelogs...");
  await seedDocument(adminId, "changelog/v1.1.0", {
    type: "changelog",
    title: "v1.1.0 - Performance & Batch Operations",
    body: changelog110Content.trim(),
    status: "published",
  });

  await seedDocument(adminId, "changelog/v1.0.0", {
    type: "changelog",
    title: "v1.0.0 - Initial Release",
    body: changelog100Content.trim(),
    status: "published",
  });

  await seedDocument(adminId, "changelog/v0.9.0", {
    type: "changelog",
    title: "v0.9.0 - Beta",
    body: changelog090Content.trim(),
    status: "published",
  });

  await seedDocument(adminId, "changelog/v0.8.0", {
    type: "changelog",
    title: "v0.8.0 - Alpha",
    body: changelog080Content.trim(),
    status: "published",
  });

  console.log("\nSeed complete!");
  if (!isProduction) {
    console.log(`\nLogin credentials:`);
    console.log(`  Username: ${ADMIN_USERNAME}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
  }
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
