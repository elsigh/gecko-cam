/**
 * Performance comparison test: raw blob access vs cached reads
 */
import { VercelBlobStore } from "../blob-store.js";
import { KV2 } from "../cached-kv.js";
import { cleanupTestBlobs, uniqueTestPrefix } from "./index.js";
async function readBlobDirect(blobStore, path) {
    const result = await blobStore.get(path, { access: "public" });
    if (!result)
        return null;
    const chunks = [];
    const reader = result.stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}
export async function runPerfTest(iterations = 10) {
    const prefix = uniqueTestPrefix();
    const blobStore = new VercelBlobStore();
    const kv = new KV2({ prefix, blobStore });
    const testValue = {
        data: "x".repeat(1000), // 1KB payload
        nested: { deeply: { value: 42 } },
        array: Array.from({ length: 100 }, (_, i) => i),
    };
    // Write test data
    await kv.set("perf-test-key", testValue, { test: true });
    const blobPath = `cached-kv/${prefix}perf-test-key`;
    // Raw blob reads - direct blob store access, bypasses all caching
    const rawBlobReads = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const buffer = await readBlobDirect(blobStore, blobPath);
        if (buffer) {
            // Parse the blob to simulate full read
            const headerLength = buffer.readUInt32BE(0);
            const headerJson = buffer.subarray(4, 4 + headerLength).toString("utf-8");
            JSON.parse(headerJson);
        }
        rawBlobReads.push(performance.now() - start);
    }
    // Cached reads via KV2 - uses @vercel/functions cache
    const cachedReads = [];
    // First read to populate cache
    const warmup = await kv.get("perf-test-key");
    if (warmup.exists)
        await warmup.value;
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = await kv.get("perf-test-key");
        if (result.exists) {
            await result.value;
        }
        cachedReads.push(performance.now() - start);
    }
    // Cleanup
    await cleanupTestBlobs(prefix, blobStore);
    // Calculate stats
    const rawBlobAvg = rawBlobReads.reduce((a, b) => a + b, 0) / rawBlobReads.length;
    const cachedAvg = cachedReads.reduce((a, b) => a + b, 0) / cachedReads.length;
    const speedup = rawBlobAvg / cachedAvg;
    const summary = [
        "",
        "=".repeat(60),
        "PERFORMANCE COMPARISON: Raw Blob vs Cached Reads",
        "=".repeat(60),
        "",
        `Iterations: ${iterations}`,
        "Payload size: ~1KB JSON",
        "",
        "Direct Blob Store Reads (no cache):",
        `  Average: ${rawBlobAvg.toFixed(2)}ms`,
        `  Min: ${Math.min(...rawBlobReads).toFixed(2)}ms`,
        `  Max: ${Math.max(...rawBlobReads).toFixed(2)}ms`,
        `  All: [${rawBlobReads.map((r) => `${r.toFixed(0)}ms`).join(", ")}]`,
        "",
        "KV2 Reads (with regional cache):",
        `  Average: ${cachedAvg.toFixed(2)}ms`,
        `  Min: ${Math.min(...cachedReads).toFixed(2)}ms`,
        `  Max: ${Math.max(...cachedReads).toFixed(2)}ms`,
        `  All: [${cachedReads.map((r) => `${r.toFixed(0)}ms`).join(", ")}]`,
        "",
        "-".repeat(60),
        `SPEEDUP: ${speedup.toFixed(1)}x faster with cache`,
        "-".repeat(60),
        "",
    ].join("\n");
    return {
        rawBlobReads,
        cachedReads,
        rawBlobAvg,
        cachedAvg,
        speedup,
        summary,
    };
}
//# sourceMappingURL=perf-test.js.map