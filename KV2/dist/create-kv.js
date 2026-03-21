import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { DiskBlobStore } from "./blob-stores/disk-blob-store.js";
import { VercelBlobStore } from "./blob-store.js";
import { KV2 } from "./cached-kv.js";
const BLOB_PREFIX = "cached-kv/";
/**
 * Create a KV store with automatic environment detection.
 *
 * @example
 * ```ts
 * // Auto-detect environment
 * const kv = createKV();
 *
 * // Explicit env/branch
 * const kv = createKV({ env: 'production', branch: 'main' });
 * ```
 */
export function createKV(options = {}) {
    const { env, branch } = detectEnvironment(options);
    const userPrefix = options.prefix ?? "";
    // Build the full prefix for local storage
    const localPrefix = buildPrefix(env, branch, userPrefix);
    // Create blob store (may fall back to DiskBlobStore for local dev)
    const blobStore = resolveBlobStore(options);
    // Create KV
    return new KV2({
        prefix: localPrefix,
        blobStore,
        cache: options.cache,
        cacheTtl: options.cacheTtl,
        largeValueThreshold: options.largeValueThreshold,
        token: options.token,
        tracer: options.tracer,
    });
}
let loggedFallback = false;
/**
 * Resolve the blob store to use: explicit > token-based > local disk fallback.
 * Throws on Vercel deployments when no token is available.
 */
function resolveBlobStore(options) {
    if (options.blobStore)
        return options.blobStore;
    const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (token)
        return new VercelBlobStore(token);
    // No token — are we deployed on Vercel?
    if (process.env.VERCEL) {
        throw new Error("Missing BLOB_READ_WRITE_TOKEN. To get started:\n" +
            "\n" +
            '  1. Create a private blob store:  vercel blob create-store -a private "my-kv-store"\n' +
            "  2. Link it to your project:      vercel link\n" +
            "  3. Pull environment variables:   vercel env pull .env.local\n" +
            "\n" +
            "See https://github.com/vercel-labs/KV2/blob/main/docs/getting-started.md");
    }
    // Local dev fallback: disk-based storage
    const cacheDir = findCacheDir();
    if (!loggedFallback) {
        loggedFallback = true;
        console.info(`[KV2] No BLOB_READ_WRITE_TOKEN found, using local disk storage at ${cacheDir}`);
    }
    return new DiskBlobStore(cacheDir);
}
/**
 * Find the nearest node_modules/.cache/@vercel/kv2 directory.
 */
function findCacheDir() {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
        if (existsSync(path.join(dir, "node_modules"))) {
            return path.join(dir, "node_modules", ".cache", "@vercel", "kv2");
        }
        dir = path.dirname(dir);
    }
    return path.join(process.cwd(), "node_modules", ".cache", "@vercel", "kv2");
}
/**
 * Detect environment from options or environment variables.
 */
function detectEnvironment(options) {
    const env = options.env || process.env.VERCEL_ENV || "development";
    const rawBranch = options.branch || process.env.VERCEL_GIT_COMMIT_REF || "main";
    const branch = encodeBranch(rawBranch);
    return { env, branch };
}
/**
 * Encode branch name to be filesystem-safe while preserving uniqueness.
 * Uses URL encoding so `feature/foo` and `feature-foo` remain distinct.
 */
function encodeBranch(branch) {
    const encoded = encodeURIComponent(branch.toLowerCase());
    if (encoded.length <= 64) {
        return encoded;
    }
    // Long branch name - use hash suffix
    const hash = sha256(branch).slice(0, 8);
    return `${encoded.slice(0, 55)}-${hash}`;
}
/**
 * Build the prefix for KV2 (without the "cached-kv/" prefix since KV2 adds it).
 */
function buildPrefix(env, branch, userPrefix) {
    // Ensure prefix ends with /
    const normalizedUserPrefix = userPrefix
        ? userPrefix.endsWith("/")
            ? userPrefix
            : `${userPrefix}/`
        : "";
    // Note: KV2 adds "cached-kv/" internally, so we only provide env/branch/userPrefix
    return `${env}/${branch}/${normalizedUserPrefix}`;
}
function sha256(input) {
    return createHash("sha256").update(input).digest("hex");
}
//# sourceMappingURL=create-kv.js.map