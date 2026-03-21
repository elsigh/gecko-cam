/**
 * In-memory cache for local development.
 * State is stored in globalThis to persist across HMR reloads.
 */

import type { CacheLike } from "./types.js";

const globalKey = Symbol.for("kv-memory-cache");

interface CacheEntry {
  value: unknown;
  tags: string[];
  expiresAt: number;
}

interface MemoryCacheState {
  data: Map<string, CacheEntry>;
  tags: Map<string, Set<string>>; // tag -> keys
}

function getState(): MemoryCacheState {
  const g = globalThis as unknown as { [globalKey]?: MemoryCacheState };
  if (!g[globalKey]) {
    g[globalKey] = {
      data: new Map(),
      tags: new Map(),
    };
  }
  return g[globalKey];
}

let loggedUsage = false;

export class MemoryCache implements CacheLike {
  private state: MemoryCacheState;

  constructor() {
    this.state = getState();
    if (!loggedUsage) {
      console.log("[MemoryCache] Using in-memory cache for local development");
      loggedUsage = true;
    }
  }

  async get(key: string): Promise<unknown> {
    const entry = this.state.data.get(key);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.state.data.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(
    key: string,
    value: unknown,
    options?: { tags?: string[]; ttl?: number },
  ): Promise<void> {
    const tags = options?.tags ?? [];
    const ttl = options?.ttl ?? 3600;

    const entry: CacheEntry = {
      value,
      tags,
      expiresAt: Date.now() + ttl * 1000,
    };

    this.state.data.set(key, entry);

    // Track tags
    for (const tag of tags) {
      if (!this.state.tags.has(tag)) {
        this.state.tags.set(tag, new Set());
      }
      this.state.tags.get(tag)?.add(key);
    }
  }

  async expireTag(tags: string[]): Promise<void> {
    for (const tag of tags) {
      const keys = this.state.tags.get(tag);
      if (keys) {
        for (const key of keys) {
          this.state.data.delete(key);
        }
        this.state.tags.delete(tag);
      }
    }
  }
}

// Singleton instance (also stored in globalThis)
const instanceKey = Symbol.for("kv-memory-cache-instance");

export function getMemoryCache(): MemoryCache {
  const g = globalThis as unknown as { [instanceKey]?: MemoryCache };
  if (!g[instanceKey]) {
    g[instanceKey] = new MemoryCache();
  }
  return g[instanceKey];
}

/**
 * Check if memory cache should be used.
 * Returns true when running locally (not on Vercel) and not in integration test mode.
 */
/* c8 ignore next 10 -- env var check, unsafe to test in concurrent test runner */
export function shouldUseMemoryCache(): boolean {
  // Don't use on Vercel
  if (process.env.VERCEL) {
    return false;
  }
  // Don't use during integration tests (they use proxy cache)
  if (process.env.INTEGRATION_TEST === "1") {
    return false;
  }
  // Use memory cache for local development
  return true;
}
