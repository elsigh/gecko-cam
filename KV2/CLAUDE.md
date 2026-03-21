# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KV2 (`@vercel/kv2`) — A type-safe KV store backed by Vercel Blob with regional edge caching. ESM-only, TypeScript.

## Commands

```bash
pnpm build              # Compile TypeScript (tsc)
pnpm test               # Build + run unit tests (uses InMemoryBlobStore, no network)
pnpm test:coverage      # Build + run tests with c8 coverage report
pnpm test:integration   # Build + run tests against real Vercel Blob (needs BLOB_READ_WRITE_TOKEN)
pnpm typecheck          # Type-check including test files (tsconfig.test.json)
pnpm check              # Biome format + lint with auto-fix
pnpm lint               # Biome lint only
pnpm lint:fix           # Biome lint with auto-fix
pnpm knip               # Check for unused exports
pnpm validate           # Full validation: knip + typecheck + test
pnpm cli [options] [command]  # KV CLI explorer (see below)
```

### CLI Explorer

Interactive KV store explorer. Read-only by default; pass `--allow-writes` to enable mutations.

```bash
pnpm cli keys [prefix]                      # List keys (first 100)
pnpm cli --all keys                         # List all keys
pnpm cli get <key>                          # Print JSON value to stdout
pnpm cli --verbose get <key>                # Also show version/metadata on stderr
pnpm cli --allow-writes set <key> <json>    # Set a value
pnpm cli --allow-writes del <key>           # Delete a key
pnpm cli                                    # Interactive REPL
```

Options: `--prefix <prefix>`, `--env <env>`, `--branch <branch>`, `--limit <n>`, `--all`, `--allow-writes`, `--verbose`.

**Important:** If your app uses `createKV({ prefix: "myapp/" })`, pass `--prefix myapp/` to the CLI.

Filter tests by name: `pnpm test -- <filter>` (matches against `suite > test name`).

## Testing

The project uses a **custom vitest-compatible test runner** (not actual vitest). The runner lives in `src/testing/vitest-compat.ts` and provides `describe`, `it`, `test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, and `expect()`.

- Test files: `src/**/*.test.ts` (co-located with source)
- Chaos tests: `src/chaos/*.chaos.test.ts`
- All test files are aggregated in `src/testing/test-index.ts` and executed by `src/testing/run-tests.ts`
- Unit tests use `InMemoryBlobStore` (in `src/blob-stores/`) and `FakeCache` (in `src/testing/`)
- Integration tests require `INTEGRATION_TEST=1` env var plus `BLOB_READ_WRITE_TOKEN`

When adding a new test file, you must import it in `src/testing/test-index.ts`.

### Writing tests

Tests run **concurrently**. Each test must create its own isolated KV instance — never use shared module-level variables set via `beforeEach`. Two patterns are used:

**Pattern 1: `setupTestContext()` + typed `it`** (for tests that use `KV2<TestMetadata>` directly)

```ts
import { it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";

describe("My feature", () => {
  setupTestContext();

  it("does something", async (ctx) => {
    // ctx.kv is an isolated KV2<TestMetadata> per test
    await ctx.kv.set("key", value, { createdBy: "test", version: 1 });
    const store = ctx.kv.getStore<MyType>("prefix/", { /* indexes */ });
  });
});
```

**Pattern 2: Inline `createTestKV()`** (for tests needing `KV2<unknown>` or custom metadata types)

```ts
import { KV2 } from "../cached-kv.js";
import { InMemoryBlobStore } from "../blob-stores/in-memory-blob-store.js";
import { describe, expect, it } from "../testing/vitest-compat.js";

function createTestKV() {
  const blobStore = new InMemoryBlobStore();
  const prefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/` as `${string}/`;
  const kv = new KV2<unknown>({ prefix, blobStore });
  return { kv, cleanup: () => blobStore.clear() };
}

describe("My feature", () => {
  it("does something", async () => {
    const { kv } = createTestKV();
    // kv is isolated to this test
  });
});
```

Key rules:
- **Never** store KV instances in `let` variables set by `beforeEach` — concurrent tests will overwrite them
- Always create a fresh `FakeBlobStore` per test (or use `setupTestContext()` which does this automatically)

## Formatting

Biome with **2-space indentation**. Run `pnpm check` to auto-fix.

## Architecture

### Core class hierarchy

- **KV2\<M\>** (`src/cached-kv.ts`) — Main KV implementation. Reads/writes Vercel Blob with optional caching layer. Generic over metadata type M.
- **TypedKV\<V, M, I\>** (`src/typed-kv.ts`) — Type-safe sub-store wrapper around KVLike. Adds key prefix, value type enforcement, and secondary indexes. Nestable.

### Key interface

**KVLike\<M\>** (`src/types.ts`) is the abstract KV interface implemented by KV2 and TypedKV. Methods: `get`, `set`, `delete`, `keys`, `values`, `entries`, `getMany`.

### Data flow

```
TypedKV (prefix + indexes + types)
  → KV2
    → KVCache (read-through/write-through, tag-based invalidation)
      → Vercel Blob
```

### Blob format

Two formats auto-detected by first byte:
- **JSON** (small values): entire blob is JSON `{value, metadata}`
- **Binary** (large values): `[4-byte header length][JSON header][raw payload]` — enables streaming without full buffering

### Factory

`createKV()` (`src/create-kv.ts`) auto-detects Vercel environment (env + branch) and creates a properly-prefixed KV2 instance.

### Tracing

Pluggable via `Tracer` interface: `noopTracer` (default), `consoleTracer`, `createOtelTracer()`, `createStatsTracer()`.

## Key patterns

- Values returned as `Promise<V>` for lazy parsing; streaming via `stream: Promise<ReadableStream>`
- Optimistic locking via `version` (blob etag) and `expectedVersion` option on `set()`
- Index entries stored with `__idx/` prefix in the same KVLike store
- Blob paths: `cached-kv/{env}/{branch}/{prefix}{key}.value`
