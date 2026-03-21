/**
 * Fake cache implementation for testing KVCache without @vercel/functions.
 * Supports programmatic control over success/failure and inspection of calls.
 */

import type { CacheLike } from "../types.js";

export interface CacheCall {
  method: "get" | "set" | "expireTag";
  args: unknown[];
  timestamp: number;
}

export class FakeCache implements CacheLike {
  private data = new Map<string, unknown>();
  private tags = new Map<string, Set<string>>(); // tag -> keys
  private calls: CacheCall[] = [];

  // Control behavior
  private getError: Error | null = null;
  private setError: Error | null = null;
  private expireTagError: Error | null = null;
  private getErrorOnce: Error[] = [];
  private setErrorOnce: Error[] = [];
  private expireTagErrorOnce: Error[] = [];

  async get(key: string): Promise<unknown> {
    this.calls.push({ method: "get", args: [key], timestamp: Date.now() });

    if (this.getErrorOnce.length > 0) {
      const error = this.getErrorOnce[0];
      this.getErrorOnce.shift();
      throw error;
    }
    if (this.getError) {
      throw this.getError;
    }

    return this.data.get(key) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    options?: { tags?: string[]; ttl?: number },
  ): Promise<void> {
    this.calls.push({
      method: "set",
      args: [key, value, options],
      timestamp: Date.now(),
    });

    if (this.setErrorOnce.length > 0) {
      const error = this.setErrorOnce[0];
      this.setErrorOnce.shift();
      throw error;
    }
    if (this.setError) {
      throw this.setError;
    }

    this.data.set(key, value);

    // Track tags
    if (options?.tags) {
      for (const tag of options.tags) {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, new Set());
        }
        this.tags.get(tag)?.add(key);
      }
    }
  }

  async expireTag(tags: string[]): Promise<void> {
    this.calls.push({
      method: "expireTag",
      args: [tags],
      timestamp: Date.now(),
    });

    if (this.expireTagErrorOnce.length > 0) {
      const error = this.expireTagErrorOnce[0];
      this.expireTagErrorOnce.shift();
      throw error;
    }
    if (this.expireTagError) {
      throw this.expireTagError;
    }

    for (const tag of tags) {
      const keys = this.tags.get(tag);
      if (keys) {
        for (const key of keys) {
          this.data.delete(key);
        }
        this.tags.delete(tag);
      }
    }
  }

  // Test helpers

  /** Set a value directly (bypassing set() tracking) */
  inject(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  /** Clear all data and call history */
  clear(): void {
    this.data.clear();
    this.tags.clear();
    this.calls = [];
    this.getError = null;
    this.setError = null;
    this.expireTagError = null;
    this.getErrorOnce = [];
    this.setErrorOnce = [];
    this.expireTagErrorOnce = [];
  }

  /** Get all recorded calls */
  getCalls(): CacheCall[] {
    return [...this.calls];
  }

  /** Get calls for a specific method */
  getCallsFor(method: "get" | "set" | "expireTag"): CacheCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  /** Clear call history only */
  clearCalls(): void {
    this.calls = [];
  }

  /** Make get() always throw */
  failGet(error: Error): void {
    this.getError = error;
  }

  /** Make set() always throw */
  failSet(error: Error): void {
    this.setError = error;
  }

  /** Make expireTag() always throw */
  failExpireTag(error: Error): void {
    this.expireTagError = error;
  }

  /** Make get() throw once, then succeed */
  failGetOnce(error: Error): void {
    this.getErrorOnce.push(error);
  }

  /** Make set() throw once, then succeed */
  failSetOnce(error: Error): void {
    this.setErrorOnce.push(error);
  }

  /** Make expireTag() throw once, then succeed */
  failExpireTagOnce(error: Error): void {
    this.expireTagErrorOnce.push(error);
  }

  /** Check if a key exists */
  has(key: string): boolean {
    return this.data.has(key);
  }

  /** Get raw data (for inspection) */
  getData(key: string): unknown {
    return this.data.get(key);
  }
}
