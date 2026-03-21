import type { EntriesIterable, KVEntry, KVGetResult, KVLike, KVSetResult, KeysIterable, SetOptions } from "./types.js";
export interface IndexDef<V> {
    /** Extract index key(s) from value. Return string for single-value, string[] for multi-value. */
    key: (value: V, primaryKey: string) => string | string[];
    /** Unique constraint. Default: false */
    unique?: boolean;
}
/**
 * Helper that lets TypeScript infer index names from an object literal,
 * avoiding the need to spell out `"byA" | "byB"` as a type parameter.
 *
 * @deprecated Use the builder pattern instead: `kv.getStore<User>("users/").withIndexes({ ... })`
 *
 * @example
 * ```ts
 * // Old (deprecated):
 * const users = kv.getStore("users/", defineIndexes<User>()({
 *   byEmail: { key: (u) => u.email, unique: true },
 *   byRole:  { key: (u) => u.role },
 * }));
 *
 * // New (preferred):
 * const users = kv.getStore<User>("users/").withIndexes({
 *   byEmail: { key: (u) => u.email, unique: true },
 *   byRole:  { key: (u) => u.role },
 * });
 * ```
 */
export declare function defineIndexes<V>(): <const I extends Record<string, IndexDef<V>>>(indexes: I) => I;
/**
 * When I = never (no indexes), resolves to never — so `string | never` = `string`.
 * When I has values, resolves to a record of optional index keys.
 * Values can be a string (exact match) or `{ prefix: string }` (prefix scan).
 */
export type IndexQueryValue = string | {
    prefix: string;
};
export type IndexQuery<I extends string> = [I] extends [never] ? never : {
    [K in I]?: IndexQueryValue;
};
/**
 * A typed sub-store that wraps any KVLike (KV2 or UpstreamKV) with a prefix.
 *
 * TypedKV implements KVLike, so it can be nested via getStore() to create
 * hierarchical key structures.
 *
 * Optionally supports secondary indexes: pass an `indexes` record to
 * `getStore()` or the constructor to auto-maintain index entries on set/delete.
 *
 * @typeParam V - Value type
 * @typeParam M - Metadata type (undefined = no metadata)
 * @typeParam I - Union of index names (never = no indexes)
 *
 * @example
 * ```ts
 * const kv = createKV({ prefix: "app/" });
 *
 * // Sub-store with indexes (builder pattern)
 * const usersKV = kv.getStore<User>("users/").withIndexes({
 *   byEmail: { key: (u) => u.email, unique: true },
 *   byRole:  { key: (u) => u.role },
 * });
 *
 * await usersKV.set("alice", { email: "a@b.com", role: "admin" });
 * const user = await usersKV.get({ byEmail: "a@b.com" });
 * for await (const key of usersKV.keys({ byRole: "admin" })) { ... }
 * ```
 */
export declare class TypedKV<V, M = undefined, I extends string = never> implements KVLike<M> {
    private parent;
    private prefix;
    private indexes?;
    private indexStores?;
    constructor(parent: KVLike<M>, prefix: string, indexes?: Record<string, IndexDef<V>>);
    /**
     * Add secondary indexes to this store, returning a new TypedKV with
     * index support. This avoids the double-invoke `defineIndexes<V>()()`
     * pattern by letting TypeScript infer index names directly.
     *
     * @example
     * ```ts
     * const users = kv.getStore<User>("users/").withIndexes({
     *   byEmail: { key: (u) => u.email, unique: true },
     *   byRole:  { key: (u) => u.role },
     * });
     * ```
     */
    withIndexes<const NewI extends Record<string, IndexDef<V>>>(indexes: NewI): TypedKV<V, M, Extract<keyof NewI, string>>;
    private prefixKey;
    /**
     * Wrap a parent entry so that `update()` routes through TypedKV.set(),
     * ensuring indexes are maintained on optimistic-locking updates.
     */
    private wrapEntry;
    /**
     * Get value by primary key or by unique index.
     * Returns the parsed value or `undefined` if not found.
     *
     * @example
     * ```ts
     * const user = await store.getValue("alice");
     * if (user) console.log(user.name);
     *
     * const user = await store.getValue({ byEmail: "alice@example.com" });
     * ```
     */
    getValue<T = V>(keyOrFilter: string | IndexQuery<I>): Promise<T | undefined>;
    /**
     * Get by primary key or by unique index.
     *
     * @example
     * ```ts
     * // By primary key
     * const result = await store.get("page/123");
     *
     * // By unique index
     * const result = await store.get({ bySlug: "hello-world" });
     * ```
     */
    get<T = V>(keyOrFilter: string | IndexQuery<I>): Promise<KVGetResult<T, M>>;
    set<T = V>(key: string, value: T | ReadableStream<Uint8Array>, ...[metadata, options]: undefined extends M ? [M?, SetOptions?] : [M, SetOptions?]): Promise<KVSetResult>;
    delete(key: string): Promise<void>;
    /**
     * List keys by prefix or by index.
     *
     * @example
     * ```ts
     * // All keys
     * for await (const key of store.keys()) { ... }
     *
     * // By prefix
     * for await (const key of store.keys("page/")) { ... }
     *
     * // By index
     * for await (const key of store.keys({ byStatus: "draft" })) { ... }
     * ```
     */
    keys(filter?: string | IndexQuery<I>): KeysIterable;
    /**
     * List entries by prefix or by index.
     *
     * @example
     * ```ts
     * // All entries
     * for await (const [key, entry] of store.entries()) { ... }
     *
     * // By index
     * const { entries } = await store.entries({ byStatus: "draft" }).page(20);
     * ```
     */
    entries<T = V>(filter?: string | IndexQuery<I>): EntriesIterable<T, M>;
    getMany<T = V>(keys: string[], concurrency?: number): Promise<Map<string, KVEntry<T, M>>>;
    /**
     * List only direct children (keys without "/" after the optional prefix).
     */
    keysShallow(prefix?: string): AsyncIterable<string>;
    /**
     * Create a nested sub-store with an accumulated prefix.
     * Chain `.withIndexes()` to add secondary indexes.
     *
     * @example
     * ```ts
     * const users = store.getStore<User>("users/").withIndexes({
     *   byEmail: { key: (u) => u.email, unique: true },
     * });
     * ```
     */
    getStore<ChildV, ChildM = M, ChildI extends string = never>(subPrefix: string, indexes?: Record<ChildI, IndexDef<ChildV>>): TypedKV<ChildV, ChildM, ChildI>;
    /**
     * Rebuild index entries by scanning all data. Idempotent.
     * Use after adding a new index to an existing store.
     *
     * @param indexName - Specific index to rebuild, or omit for all indexes.
     * @returns Number of entries indexed.
     */
    reindex(indexName?: I extends never ? never : I): Promise<{
        indexed: number;
    }>;
    private keysByPrefix;
    private entriesByPrefix;
    private getByIndex;
    private keysByIndex;
    private entriesByIndex;
}
//# sourceMappingURL=typed-kv.d.ts.map