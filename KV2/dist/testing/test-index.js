/**
 * Test index - imports all test files to register them with vitest-compat.
 * Import this file to load all tests before running.
 */
// Core tests
import "../blob-format.test.js";
import "../cache.test.js";
import "../cached-kv.test.js";
import "../tracing.test.js";
import "../proxy-cache.test.js";
import "../cached-kv.values.test.js";
import "../cached-kv.keys.test.js";
import "../cached-kv.entries.test.js";
import "../cached-kv.cache.test.js";
import "../typed-kv.test.js";
import "../no-metadata.test.js";
import "../optimistic-locking.test.js";
// Environment-aware tests
import "../create-kv.test.js";
// Chaos tests
import "../chaos/boundaries.chaos.test.js";
import "../chaos/cache.chaos.test.js";
import "../chaos/concurrency.chaos.test.js";
import "../chaos/streams.chaos.test.js";
import "../chaos/malformed.chaos.test.js";
// TypedKV index tests
import "../indexed-kv.test.js";
import "../index-orphans.test.js";
// CLI tests
import "../cli.test.js";
// Testing infrastructure tests
import "./fake-blob-store.test.js";
// Blob store tests
import "../blob-stores/disk-blob-store.test.js";
// Example app pattern tests
import "../examples/cms-patterns.test.js";
import "../examples/auth-patterns.test.js";
// Security tests
import "../security.test.js";
// Documentation tests
import "../readme.test.js";
//# sourceMappingURL=test-index.js.map