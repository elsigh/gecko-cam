/**
 * Error thrown when a conditional update fails due to version mismatch.
 */
export class KVVersionConflictError extends Error {
    constructor(key) {
        super(`Version conflict: "${key}" was modified by another process`);
        this.name = "KVVersionConflictError";
    }
}
/**
 * Error thrown when a unique index constraint is violated.
 */
export class KVIndexConflictError extends Error {
    indexName;
    /** The conflicting index key value (available for programmatic access, not included in message) */
    indexKey;
    constructor(indexName, indexKey) {
        super(`Unique index "${indexName}" conflict: another entry already uses this index value`);
        this.name = "KVIndexConflictError";
        this.indexName = indexName;
        this.indexKey = indexKey;
    }
}
//# sourceMappingURL=types.js.map