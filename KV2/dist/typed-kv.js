import { KVIndexConflictError, KVVersionConflictError } from "./types.js";
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
export function defineIndexes() {
    return (indexes) => indexes;
}
const VALUE_SUFFIX = ".value";
const INDEX_PREFIX = "__idx/";
function normalizeIndexKeys(raw) {
    return Array.isArray(raw) ? raw : [raw];
}
/** Encode a component for non-unique index key paths, escaping / and % */
function encodeForIndex(s) {
    return s.replaceAll("%", "%25").replaceAll("/", "%2F");
}
/** Decode an index component back to its original value */
function decodeForIndex(s) {
    return s.replaceAll("%2F", "/").replaceAll("%25", "%");
}
/** Construct a non-unique index entry key */
function nonUniqueIndexKey(indexValue, primaryKey) {
    return `${encodeForIndex(indexValue)}/${encodeForIndex(primaryKey)}`;
}
/** Construct a scan prefix for non-unique index exact match */
function nonUniqueScanPrefix(indexValue) {
    return `${encodeForIndex(indexValue)}/`;
}
/** Extract the index value from a non-unique index scan key, given the known primary key */
function extractIndexValue(scanKey, primaryKey) {
    const encodedPK = encodeForIndex(primaryKey);
    return decodeForIndex(scanKey.slice(0, scanKey.length - encodedPK.length - 1));
}
function isIndexQuery(filter) {
    return typeof filter === "object" && filter !== null;
}
function parseIndexQuery(filter) {
    const entries = Object.entries(filter);
    if (entries.length !== 1) {
        throw new Error(`Index query must have exactly one key, got ${entries.length}`);
    }
    const [indexName, rawValue] = entries[0];
    if (typeof rawValue === "object" &&
        rawValue !== null &&
        "prefix" in rawValue) {
        return { indexName, mode: "prefix", value: rawValue.prefix };
    }
    return { indexName, mode: "exact", value: rawValue };
}
const NOT_FOUND = {
    exists: false,
    metadata: undefined,
    value: undefined,
    stream: undefined,
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
export class TypedKV {
    parent;
    prefix;
    indexes;
    indexStores;
    constructor(parent, prefix, indexes) {
        if (prefix.endsWith(VALUE_SUFFIX)) {
            throw new Error(`Store prefix cannot end with "${VALUE_SUFFIX}": ${prefix}`);
        }
        this.parent = parent;
        this.prefix = prefix;
        if (indexes && Object.keys(indexes).length > 0) {
            this.indexes = indexes;
            this.indexStores = {};
            for (const name of Object.keys(indexes)) {
                this.indexStores[name] = new TypedKV(parent, `${INDEX_PREFIX}${prefix}${name}/`);
            }
        }
    }
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
    withIndexes(indexes) {
        if (this.indexes) {
            throw new Error("withIndexes() cannot be called on a store that already has indexes");
        }
        return new TypedKV(this.parent, this.prefix, indexes);
    }
    prefixKey(key) {
        return `${this.prefix}${key}`;
    }
    /**
     * Wrap a parent entry so that `update()` routes through TypedKV.set(),
     * ensuring indexes are maintained on optimistic-locking updates.
     */
    wrapEntry(primaryKey, entry) {
        if (!this.indexes)
            return entry;
        return {
            ...entry,
            update: async (value, metadata) => {
                const meta = (metadata ?? entry.metadata);
                return this.set(primaryKey, value, ...[meta, { expectedVersion: entry.version }]);
            },
        };
    }
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
    async getValue(keyOrFilter) {
        const result = await this.get(keyOrFilter);
        return result.exists ? result.value : undefined;
    }
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
    async get(keyOrFilter) {
        if (isIndexQuery(keyOrFilter)) {
            return this.getByIndex(keyOrFilter);
        }
        const key = keyOrFilter;
        const result = await this.parent.get(this.prefixKey(key));
        if (!result.exists)
            return result;
        return this.wrapEntry(key, result);
    }
    async set(key, value, ...[metadata, options]) {
        if (!this.indexes) {
            return this.parent.set(this.prefixKey(key), value, metadata, options);
        }
        // --- Index-aware write path ---
        const v = value;
        // 1. Read old entry to determine old index keys
        const oldResult = await this.parent.get(this.prefixKey(key));
        const oldValue = oldResult.exists ? await oldResult.value : undefined;
        // 2. Check unique constraints for new index keys that changed.
        // Track keys that already exist pointing to this primary key (self-update).
        const selfExistingIndexKeys = new Set();
        for (const [name, def] of Object.entries(this.indexes)) {
            if (!def.unique)
                continue;
            const newKeys = normalizeIndexKeys(def.key(v, key));
            const oldKeys = oldValue
                ? normalizeIndexKeys(def.key(oldValue, key))
                : [];
            const oldSet = new Set(oldKeys);
            for (const newKey of newKeys) {
                if (oldSet.has(newKey))
                    continue;
                // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
                const existing = await this.indexStores[name].get(newKey);
                if (existing.exists) {
                    const existingPK = await existing.value;
                    if (existingPK !== key) {
                        throw new KVIndexConflictError(name, newKey);
                    }
                    // Already points to us (stale from previous write); skip re-creation
                    selfExistingIndexKeys.add(`${name}\0${newKey}`);
                }
            }
        }
        // 3. Create new index entries before main write. If the main write
        // later fails, these become orphans that self-heal on read.
        const createOps = [];
        const deleteOps = [];
        for (const [name, def] of Object.entries(this.indexes)) {
            const newKeys = normalizeIndexKeys(def.key(v, key));
            const oldKeys = oldValue
                ? normalizeIndexKeys(def.key(oldValue, key))
                : [];
            const newSet = new Set(newKeys);
            const oldSet = new Set(oldKeys);
            // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
            const indexStore = this.indexStores[name];
            const isUnique = def.unique ?? false;
            // Collect old index deletions — deferred until after main write
            for (const oldKey of oldKeys) {
                if (!newSet.has(oldKey)) {
                    if (isUnique) {
                        deleteOps.push(() => indexStore.delete(oldKey));
                    }
                    else {
                        deleteOps.push(() => indexStore.delete(nonUniqueIndexKey(oldKey, key)));
                    }
                }
            }
            for (const newKey of newKeys) {
                if (!oldSet.has(newKey)) {
                    if (isUnique) {
                        if (selfExistingIndexKeys.has(`${name}\0${newKey}`)) {
                            // Entry already points to us, just overwrite
                            createOps.push(indexStore.set(newKey, key));
                        }
                        else {
                            // New entry — use override: false for TOCTOU protection
                            createOps.push(indexStore
                                .set(newKey, key, undefined, { override: false })
                                .catch((e) => {
                                if (e instanceof KVVersionConflictError) {
                                    throw new KVIndexConflictError(name, newKey);
                                }
                                throw e;
                            }));
                        }
                    }
                    else {
                        createOps.push(indexStore.set(nonUniqueIndexKey(newKey, key), key));
                    }
                }
            }
        }
        await Promise.all(createOps);
        // 4. Write main entry
        const result = await this.parent.set(this.prefixKey(key), value, metadata, options);
        // 5. Delete old index entries after main write succeeds.
        // If these fail, stale entries self-heal on read.
        await Promise.all(deleteOps.map((fn) => fn().catch(() => { })));
        return result;
    }
    async delete(key) {
        if (!this.indexes) {
            return this.parent.delete(this.prefixKey(key));
        }
        // --- Index-aware delete path ---
        const result = await this.parent.get(this.prefixKey(key));
        if (!result.exists)
            return;
        const value = await result.value;
        await this.parent.delete(this.prefixKey(key));
        // Delete all index entries concurrently (fire-and-forget — orphans self-heal on read)
        const deleteOps = [];
        for (const [name, def] of Object.entries(this.indexes)) {
            const keys = normalizeIndexKeys(def.key(value, key));
            // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
            const indexStore = this.indexStores[name];
            const isUnique = def.unique ?? false;
            for (const indexKey of keys) {
                if (isUnique) {
                    deleteOps.push(indexStore.delete(indexKey).catch(() => { }));
                }
                else {
                    deleteOps.push(indexStore.delete(nonUniqueIndexKey(indexKey, key)).catch(() => { }));
                }
            }
        }
        await Promise.all(deleteOps);
    }
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
    keys(filter) {
        if (isIndexQuery(filter)) {
            return this.keysByIndex(filter);
        }
        return this.keysByPrefix(filter);
    }
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
    entries(filter) {
        if (isIndexQuery(filter)) {
            return this.entriesByIndex(filter);
        }
        return this.entriesByPrefix(filter);
    }
    async getMany(keys, concurrency) {
        const prefixedKeys = keys.map((k) => this.prefixKey(k));
        const results = await this.parent.getMany(prefixedKeys, concurrency);
        const strippedResults = new Map();
        for (const [key, entry] of results) {
            if (key.startsWith(this.prefix)) {
                strippedResults.set(key.slice(this.prefix.length), entry);
            }
        }
        return strippedResults;
    }
    /**
     * List only direct children (keys without "/" after the optional prefix).
     */
    async *keysShallow(prefix) {
        const searchPrefix = prefix ?? "";
        for await (const key of this.keys(searchPrefix)) {
            const suffix = key.slice(searchPrefix.length);
            if (!suffix.includes("/")) {
                yield key;
            }
        }
    }
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
    getStore(subPrefix, indexes) {
        return new TypedKV(this.parent, this.prefix + subPrefix, indexes);
    }
    /**
     * Rebuild index entries by scanning all data. Idempotent.
     * Use after adding a new index to an existing store.
     *
     * @param indexName - Specific index to rebuild, or omit for all indexes.
     * @returns Number of entries indexed.
     */
    async reindex(indexName) {
        if (!this.indexes) {
            throw new Error("No indexes defined on this store");
        }
        const toReindex = indexName
            ? { [indexName]: this.indexes[indexName] }
            : this.indexes;
        let count = 0;
        for await (const [key, entry] of this.entriesByPrefix()) {
            const value = (await entry.value);
            const ops = [];
            for (const [name, def] of Object.entries(toReindex)) {
                if (!def)
                    continue;
                const indexKeys = normalizeIndexKeys(def.key(value, key));
                // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
                const indexStore = this.indexStores[name];
                const isUnique = def.unique ?? false;
                for (const indexKey of indexKeys) {
                    if (isUnique) {
                        ops.push(indexStore.set(indexKey, key));
                    }
                    else {
                        ops.push(indexStore.set(nonUniqueIndexKey(indexKey, key), key));
                    }
                }
            }
            await Promise.all(ops);
            count++;
        }
        return { indexed: count };
    }
    // =========================================================================
    // Private: prefix-based scan (original keys/entries behavior)
    // =========================================================================
    keysByPrefix(prefix) {
        const self = this;
        const fullPrefix = this.prefixKey(prefix ?? "");
        return {
            async *[Symbol.asyncIterator]() {
                for await (const key of self.parent.keys(fullPrefix)) {
                    if (key.startsWith(self.prefix)) {
                        yield key.slice(self.prefix.length);
                    }
                }
            },
            async page(limit, cursor) {
                const { keys, cursor: nextCursor } = await self.parent
                    .keys(fullPrefix)
                    .page(limit, cursor);
                const strippedKeys = keys
                    .filter((key) => key.startsWith(self.prefix))
                    .map((key) => key.slice(self.prefix.length));
                return { keys: strippedKeys, cursor: nextCursor };
            },
        };
    }
    entriesByPrefix(prefix) {
        const self = this;
        const fullPrefix = this.prefixKey(prefix ?? "");
        return {
            async *[Symbol.asyncIterator]() {
                for await (const [key, entry] of self.parent.entries(fullPrefix)) {
                    if (key.startsWith(self.prefix)) {
                        yield [key.slice(self.prefix.length), entry];
                    }
                }
            },
            async page(limit, cursor) {
                const { entries, cursor: nextCursor } = await self.parent
                    .entries(fullPrefix)
                    .page(limit, cursor);
                const strippedEntries = entries
                    .filter(([key]) => key.startsWith(self.prefix))
                    .map(([key, entry]) => [key.slice(self.prefix.length), entry]);
                return { entries: strippedEntries, cursor: nextCursor };
            },
        };
    }
    // =========================================================================
    // Private: index-based lookups
    // =========================================================================
    async getByIndex(filter) {
        const { indexName, mode, value: indexKey } = parseIndexQuery(filter);
        if (mode === "prefix") {
            throw new Error("get() does not support prefix queries. Use keys() or entries() instead.");
        }
        const def = this.indexes?.[indexName];
        if (!def) {
            throw new Error(`Unknown index: "${indexName}"`);
        }
        if (!def.unique) {
            throw new Error(`get() with index requires a unique index, "${indexName}" is non-unique. Use keys() or entries() instead.`);
        }
        // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
        const indexStore = this.indexStores[indexName];
        const indexResult = await indexStore.get(indexKey);
        if (!indexResult.exists) {
            return NOT_FOUND;
        }
        const primaryKey = await indexResult.value;
        const entry = await this.parent.get(this.prefixKey(primaryKey));
        // Orphan type 1: main entry doesn't exist
        if (!entry.exists) {
            indexStore.delete(indexKey).catch(() => { });
            return NOT_FOUND;
        }
        // Orphan type 2: index points to value with different index key
        const value = await entry.value;
        const currentKeys = normalizeIndexKeys(def.key(value, primaryKey));
        if (!currentKeys.includes(indexKey)) {
            indexStore.delete(indexKey).catch(() => { });
            return NOT_FOUND;
        }
        return this.wrapEntry(primaryKey, {
            exists: true,
            metadata: entry.metadata,
            value: Promise.resolve(value),
            stream: entry.stream,
            version: entry.version,
            update: entry.update,
        });
    }
    keysByIndex(filter) {
        const { indexName, mode, value } = parseIndexQuery(filter);
        const def = this.indexes?.[indexName];
        if (!def) {
            throw new Error(`Unknown index: "${indexName}"`);
        }
        // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
        const indexStore = this.indexStores[indexName];
        const self = this;
        const isUnique = def.unique ?? false;
        // Exact match on unique index: fast single-key lookup
        if (mode === "exact" && isUnique) {
            const indexKey = value;
            return {
                async *[Symbol.asyncIterator]() {
                    const result = await self.getByIndex(filter);
                    if (result.exists) {
                        const indexResult = await indexStore.get(indexKey);
                        if (indexResult.exists) {
                            yield await indexResult.value;
                        }
                    }
                },
                async page(limit, cursor) {
                    if (cursor)
                        return { keys: [] };
                    const result = await self.getByIndex(filter);
                    if (result.exists) {
                        const indexResult = await indexStore.get(indexKey);
                        if (indexResult.exists) {
                            return { keys: [await indexResult.value] };
                        }
                    }
                    return { keys: [] };
                },
            };
        }
        // Exact match on non-unique index: scan encoded {indexKey}/ prefix
        if (mode === "exact") {
            const indexKey = value;
            const scanPrefix = nonUniqueScanPrefix(indexKey);
            return {
                async *[Symbol.asyncIterator]() {
                    for await (const [, entry] of indexStore.entries(scanPrefix)) {
                        const primaryKey = await entry.value;
                        const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                        if (mainEntry.exists) {
                            const val = await mainEntry.value;
                            const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                            if (currentKeys.includes(indexKey)) {
                                yield primaryKey;
                            }
                            else {
                                indexStore
                                    .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                    .catch(() => { });
                            }
                        }
                        else {
                            indexStore
                                .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                .catch(() => { });
                        }
                    }
                },
                async page(limit, cursor) {
                    const { entries, cursor: nextCursor } = await indexStore
                        .entries(scanPrefix)
                        .page(limit, cursor);
                    const keys = [];
                    for (const [, entry] of entries) {
                        const primaryKey = await entry.value;
                        const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                        if (mainEntry.exists) {
                            const val = await mainEntry.value;
                            const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                            if (currentKeys.includes(indexKey)) {
                                keys.push(primaryKey);
                            }
                            else {
                                indexStore
                                    .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                    .catch(() => { });
                            }
                        }
                        else {
                            indexStore
                                .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                .catch(() => { });
                        }
                    }
                    return { keys, cursor: nextCursor };
                },
            };
        }
        // Prefix scan (works for both unique and non-unique indexes)
        const scanPrefix = value;
        return {
            async *[Symbol.asyncIterator]() {
                for await (const [scanKey, entry] of indexStore.entries(scanPrefix)) {
                    const primaryKey = await entry.value;
                    const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                    if (mainEntry.exists) {
                        const val = await mainEntry.value;
                        const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                        const indexValue = isUnique
                            ? scanKey
                            : extractIndexValue(scanKey, primaryKey);
                        if (currentKeys.includes(indexValue)) {
                            yield primaryKey;
                        }
                        else {
                            indexStore.delete(scanKey).catch(() => { });
                        }
                    }
                    else {
                        indexStore.delete(scanKey).catch(() => { });
                    }
                }
            },
            async page(limit, cursor) {
                const { entries, cursor: nextCursor } = await indexStore
                    .entries(scanPrefix)
                    .page(limit, cursor);
                const keys = [];
                for (const [scanKey, entry] of entries) {
                    const primaryKey = await entry.value;
                    const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                    if (mainEntry.exists) {
                        const val = await mainEntry.value;
                        const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                        const indexValue = isUnique
                            ? scanKey
                            : extractIndexValue(scanKey, primaryKey);
                        if (currentKeys.includes(indexValue)) {
                            keys.push(primaryKey);
                        }
                        else {
                            indexStore.delete(scanKey).catch(() => { });
                        }
                    }
                    else {
                        indexStore.delete(scanKey).catch(() => { });
                    }
                }
                return { keys, cursor: nextCursor };
            },
        };
    }
    entriesByIndex(filter) {
        const { indexName, mode, value } = parseIndexQuery(filter);
        const def = this.indexes?.[indexName];
        if (!def) {
            throw new Error(`Unknown index: "${indexName}"`);
        }
        // biome-ignore lint/style/noNonNullAssertion: indexStores is guaranteed to exist when indexes are defined
        const indexStore = this.indexStores[indexName];
        const self = this;
        const isUnique = def.unique ?? false;
        // Exact match on unique index: fast single-entry lookup
        if (mode === "exact" && isUnique) {
            const indexKey = value;
            return {
                async *[Symbol.asyncIterator]() {
                    const result = await self.getByIndex(filter);
                    if (result.exists) {
                        const indexResult = await indexStore.get(indexKey);
                        if (indexResult.exists) {
                            const pk = await indexResult.value;
                            yield [pk, result];
                        }
                    }
                },
                async page(limit, cursor) {
                    if (cursor)
                        return { entries: [] };
                    const result = await self.getByIndex(filter);
                    if (result.exists) {
                        const indexResult = await indexStore.get(indexKey);
                        if (indexResult.exists) {
                            const pk = await indexResult.value;
                            return { entries: [[pk, result]] };
                        }
                    }
                    return { entries: [] };
                },
            };
        }
        // Exact match on non-unique index: scan encoded {indexKey}/ prefix
        if (mode === "exact") {
            const indexKey = value;
            const scanPrefix = nonUniqueScanPrefix(indexKey);
            return {
                async *[Symbol.asyncIterator]() {
                    for await (const [, indexEntry] of indexStore.entries(scanPrefix)) {
                        const primaryKey = await indexEntry.value;
                        const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                        if (mainEntry.exists) {
                            const val = await mainEntry.value;
                            const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                            if (currentKeys.includes(indexKey)) {
                                yield [
                                    primaryKey,
                                    self.wrapEntry(primaryKey, {
                                        exists: true,
                                        metadata: mainEntry.metadata,
                                        value: Promise.resolve(val),
                                        stream: mainEntry.stream,
                                        version: mainEntry.version,
                                        update: mainEntry.update,
                                    }),
                                ];
                            }
                            else {
                                indexStore
                                    .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                    .catch(() => { });
                            }
                        }
                        else {
                            indexStore
                                .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                .catch(() => { });
                        }
                    }
                },
                async page(limit, cursor) {
                    const { entries: indexEntries, cursor: nextCursor } = await indexStore
                        .entries(scanPrefix)
                        .page(limit, cursor);
                    const entries = [];
                    for (const [, indexEntry] of indexEntries) {
                        const primaryKey = await indexEntry.value;
                        const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                        if (mainEntry.exists) {
                            const val = await mainEntry.value;
                            const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                            if (currentKeys.includes(indexKey)) {
                                entries.push([
                                    primaryKey,
                                    self.wrapEntry(primaryKey, {
                                        exists: true,
                                        metadata: mainEntry.metadata,
                                        value: Promise.resolve(val),
                                        stream: mainEntry.stream,
                                        version: mainEntry.version,
                                        update: mainEntry.update,
                                    }),
                                ]);
                            }
                            else {
                                indexStore
                                    .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                    .catch(() => { });
                            }
                        }
                        else {
                            indexStore
                                .delete(nonUniqueIndexKey(indexKey, primaryKey))
                                .catch(() => { });
                        }
                    }
                    return { entries, cursor: nextCursor };
                },
            };
        }
        // Prefix scan (works for both unique and non-unique indexes)
        const scanPrefix = value;
        return {
            async *[Symbol.asyncIterator]() {
                for await (const [scanKey, indexEntry] of indexStore.entries(scanPrefix)) {
                    const primaryKey = await indexEntry.value;
                    const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                    if (mainEntry.exists) {
                        const val = await mainEntry.value;
                        const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                        const indexValue = isUnique
                            ? scanKey
                            : extractIndexValue(scanKey, primaryKey);
                        if (currentKeys.includes(indexValue)) {
                            yield [
                                primaryKey,
                                self.wrapEntry(primaryKey, {
                                    exists: true,
                                    metadata: mainEntry.metadata,
                                    value: Promise.resolve(val),
                                    stream: mainEntry.stream,
                                    version: mainEntry.version,
                                    update: mainEntry.update,
                                }),
                            ];
                        }
                        else {
                            indexStore.delete(scanKey).catch(() => { });
                        }
                    }
                    else {
                        indexStore.delete(scanKey).catch(() => { });
                    }
                }
            },
            async page(limit, cursor) {
                const { entries: indexEntries, cursor: nextCursor } = await indexStore
                    .entries(scanPrefix)
                    .page(limit, cursor);
                const entries = [];
                for (const [scanKey, indexEntry] of indexEntries) {
                    const primaryKey = await indexEntry.value;
                    const mainEntry = await self.parent.get(self.prefixKey(primaryKey));
                    if (mainEntry.exists) {
                        const val = await mainEntry.value;
                        const currentKeys = normalizeIndexKeys(def.key(val, primaryKey));
                        const indexValue = isUnique
                            ? scanKey
                            : extractIndexValue(scanKey, primaryKey);
                        if (currentKeys.includes(indexValue)) {
                            entries.push([
                                primaryKey,
                                self.wrapEntry(primaryKey, {
                                    exists: true,
                                    metadata: mainEntry.metadata,
                                    value: Promise.resolve(val),
                                    stream: mainEntry.stream,
                                    version: mainEntry.version,
                                    update: mainEntry.update,
                                }),
                            ]);
                        }
                        else {
                            indexStore.delete(scanKey).catch(() => { });
                        }
                    }
                    else {
                        indexStore.delete(scanKey).catch(() => { });
                    }
                }
                return { entries, cursor: nextCursor };
            },
        };
    }
}
//# sourceMappingURL=typed-kv.js.map