import { describe, expect } from "../testing/vitest-compat.js";
import { KV2, it, setupChaosContext, } from "./chaos-test-setup.js";
/**
 * Chaos tests for concurrency scenarios.
 * These tests explore race conditions, parallel operations, and timing issues.
 */
describe("Chaos: Concurrency", () => {
    setupChaosContext();
    describe("parallel writes to same key", () => {
        it("should handle rapid-fire writes to the same key", async (ctx) => {
            const { kv } = ctx;
            const key = "race-target";
            const writeCount = 50;
            // Fire off many writes simultaneously
            const writes = Array.from({ length: writeCount }, (_, i) => kv.set(key, { index: i, data: `write-${i}` }, {
                createdBy: `writer-${i}`,
                version: i,
            }));
            await Promise.all(writes);
            // One of them should have won
            const result = await kv.get(key);
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.index).toBeGreaterThanOrEqual(0);
                expect(value.index).toBeLessThan(writeCount);
            }
        });
        it("should handle interleaved reads and writes", async (ctx) => {
            const { kv } = ctx;
            const key = "interleaved";
            const operations = 100;
            await kv.set(key, "initial", { createdBy: "setup", version: 0 });
            // Mix of reads and writes
            const ops = Array.from({ length: operations }, (_, i) => {
                if (i % 3 === 0) {
                    return kv.set(key, `value-${i}`, { createdBy: "writer", version: i });
                }
                return kv.get(key);
            });
            const results = await Promise.all(ops);
            // All operations should complete without error
            const reads = results.filter((r) => r != null && typeof r === "object" && "exists" in r);
            expect(reads.length).toBeGreaterThan(0);
            for (const r of reads) {
                expect(r.exists).toBe(true);
            }
        });
        it("should handle parallel deletes with reads", async (ctx) => {
            const { kv } = ctx;
            const keys = Array.from({ length: 20 }, (_, i) => `delete-target-${i}`);
            // Set up all keys
            await Promise.all(keys.map((key) => kv.set(key, "to-be-deleted", { createdBy: "setup", version: 1 })));
            // Mix deletes and reads
            const ops = keys.flatMap((key) => [
                kv.delete(key),
                kv.get(key),
                kv.get(key), // Double-read to catch race conditions
            ]);
            const results = await Promise.all(ops);
            // Eventually all keys should be deleted
            for (const key of keys) {
                const final = await kv.get(key);
                expect(final.exists).toBe(false);
            }
        });
    });
    describe("parallel operations on different keys", () => {
        it("should handle massive parallel writes to different keys", async (ctx) => {
            const { kv } = ctx;
            const keyCount = 200;
            const keys = Array.from({ length: keyCount }, (_, i) => `parallel-${i}`);
            const writes = keys.map((key, i) => kv.set(key, { id: i }, { createdBy: "bulk", version: 1 }));
            await Promise.all(writes);
            // All keys should exist with correct values
            const reads = await Promise.all(keys.map(async (key, i) => {
                const result = await kv.get(key);
                return { key, result, expectedId: i };
            }));
            for (const { key, result, expectedId } of reads) {
                expect(result.exists, `Key ${key} should exist`).toBe(true);
                if (result.exists) {
                    const value = await result.value;
                    expect(value).toEqual({ id: expectedId });
                }
            }
        });
        it("should handle parallel reads without corrupting each other", async (ctx) => {
            const { kv } = ctx;
            // Set up a key with a complex value
            const complexValue = {
                nested: { deeply: { data: Array.from({ length: 100 }, (_, i) => i) } },
            };
            await kv.set("shared-read", complexValue, {
                createdBy: "setup",
                version: 1,
            });
            // Many parallel reads
            const reads = Array.from({ length: 100 }, () => kv.get("shared-read"));
            const results = await Promise.all(reads);
            // All reads should return the same value
            for (const result of results) {
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect(await result.value).toEqual(complexValue);
                }
            }
        });
    });
    describe("lazy value access races", () => {
        it("should handle multiple simultaneous accesses to lazy value", async (ctx) => {
            const { kv } = ctx;
            await kv.set("lazy-target", { data: "test" }, { createdBy: "setup", version: 1 });
            const result = await kv.get("lazy-target");
            expect(result.exists).toBe(true);
            if (result.exists) {
                // Access value multiple times in parallel
                const accesses = Array.from({ length: 50 }, () => result.value);
                const values = await Promise.all(accesses);
                // All should return the same value (same promise)
                for (const v of values) {
                    expect(v).toEqual({ data: "test" });
                }
            }
        });
        it("should handle concurrent value and stream access on same result", async (ctx) => {
            const { kv } = ctx;
            const data = Buffer.from("stream vs value race");
            await kv.set("stream-race", data, { createdBy: "setup", version: 1 });
            const result = await kv.get("stream-race");
            expect(result.exists).toBe(true);
            if (result.exists) {
                // Access both value and stream concurrently
                const [value1, stream1, value2, stream2, value3] = await Promise.all([
                    result.value,
                    result.stream,
                    result.value,
                    result.stream,
                    result.value,
                ]);
                // Values should all be the same
                expect(value1).toEqual(data);
                expect(value2).toEqual(data);
                expect(value3).toEqual(data);
                // Streams should be readable
                expect(stream1).toBeInstanceOf(ReadableStream);
                expect(stream2).toBeInstanceOf(ReadableStream);
            }
        });
    });
    describe("write-then-read consistency", () => {
        it("should read the written value immediately after write", async (ctx) => {
            const { kv } = ctx;
            // This tests read-your-writes consistency
            const iterations = 50;
            for (let i = 0; i < iterations; i++) {
                const key = `consistency-${i}`;
                const value = { iteration: i, timestamp: Date.now() };
                await kv.set(key, value, { createdBy: "tester", version: i });
                // Immediate read should see the value
                const result = await kv.get(key);
                expect(result.exists).toBe(true);
                if (result.exists) {
                    expect(await result.value).toEqual(value);
                    expect(result.metadata.version).toBe(i);
                }
            }
        });
        it("should handle update-then-read cycles", async (ctx) => {
            const { kv } = ctx;
            const key = "update-cycle";
            // Many update cycles
            for (let i = 0; i < 30; i++) {
                await kv.set(key, { count: i }, { createdBy: "counter", version: i });
                const result = await kv.get(key);
                expect(result.exists).toBe(true);
                if (result.exists) {
                    const value = await result.value;
                    expect(value.count).toBe(i);
                }
            }
        });
    });
    describe("multiple KV instances", () => {
        it("should handle multiple KV instances on same prefix", async (ctx) => {
            const { prefix, blobStore } = ctx;
            // Create multiple KV instances pointing to same store
            const kv1 = new KV2({ prefix, blobStore });
            const kv2 = new KV2({ prefix, blobStore });
            const kv3 = new KV2({ prefix, blobStore });
            // Write from one, read from another
            await kv1.set("shared-key", "from-kv1", { createdBy: "kv1", version: 1 });
            const result2 = await kv2.get("shared-key");
            expect(result2.exists).toBe(true);
            if (result2.exists) {
                expect(await result2.value).toBe("from-kv1");
            }
            // Update from kv2, read from kv3
            await kv2.set("shared-key", "from-kv2", { createdBy: "kv2", version: 2 });
            const result3 = await kv3.get("shared-key");
            expect(result3.exists).toBe(true);
            if (result3.exists) {
                expect(await result3.value).toBe("from-kv2");
            }
        });
        it("should handle parallel operations across multiple instances", async (ctx) => {
            const { prefix, blobStore } = ctx;
            const instances = Array.from({ length: 5 }, () => new KV2({ prefix, blobStore }));
            // Each instance writes to its own keys
            const writes = instances.flatMap((instance, i) => Array.from({ length: 10 }, (_, j) => instance.set(`instance-${i}-key-${j}`, `value-${i}-${j}`, {
                createdBy: `instance-${i}`,
                version: j,
            })));
            await Promise.all(writes);
            // Cross-read: each instance reads keys from other instances
            for (const instance of instances) {
                for (let i = 0; i < 5; i++) {
                    for (let j = 0; j < 10; j++) {
                        const result = await instance.get(`instance-${i}-key-${j}`);
                        expect(result.exists).toBe(true);
                        if (result.exists) {
                            expect(await result.value).toBe(`value-${i}-${j}`);
                        }
                    }
                }
            }
        });
    });
    describe("keys() iteration under mutation", () => {
        it("should handle iteration while keys are being added", async (ctx) => {
            const { kv } = ctx;
            // Pre-populate some keys
            await Promise.all(Array.from({ length: 10 }, (_, i) => kv.set(`existing-${i}`, i, { createdBy: "setup", version: 1 })));
            // Start iteration and add keys while iterating
            const foundKeys = [];
            const addPromises = [];
            let count = 0;
            for await (const key of kv.keys()) {
                foundKeys.push(key);
                // Add new key during iteration
                if (count < 5) {
                    addPromises.push(kv
                        .set(`added-during-${count}`, count, {
                        createdBy: "during",
                        version: 1,
                    })
                        .then(() => { }));
                }
                count++;
            }
            await Promise.all(addPromises);
            // We should have found at least the original keys
            expect(foundKeys.length).toBeGreaterThanOrEqual(10);
        });
        it("should handle iteration while keys are being deleted", async (ctx) => {
            const { kv } = ctx;
            // Pre-populate many keys
            await Promise.all(Array.from({ length: 20 }, (_, i) => kv.set(`deletable-${i}`, i, { createdBy: "setup", version: 1 })));
            // Start iteration and delete keys while iterating
            const foundKeys = [];
            const deletePromises = [];
            let count = 0;
            for await (const key of kv.keys()) {
                foundKeys.push(key);
                // Delete keys during iteration
                if (count < 10 && count % 2 === 0) {
                    deletePromises.push(kv.delete(`deletable-${count + 10}`));
                }
                count++;
            }
            await Promise.all(deletePromises);
            // We should have seen some keys (behavior depends on implementation)
            expect(foundKeys.length).toBeGreaterThan(0);
        });
    });
    describe("stress tests", () => {
        it("should survive burst of operations", async (ctx) => {
            const { kv } = ctx;
            const burstSize = 500;
            const operations = [];
            for (let i = 0; i < burstSize; i++) {
                const op = i % 4;
                const key = `burst-${i % 50}`;
                switch (op) {
                    case 0:
                        operations.push(kv.set(key, { i }, { createdBy: "burst", version: i }));
                        break;
                    case 1:
                        operations.push(kv.get(key));
                        break;
                    case 2:
                        operations.push(kv.delete(key));
                        break;
                    case 3:
                        operations.push((async () => {
                            const keys = [];
                            for await (const k of kv.keys()) {
                                keys.push(k);
                                if (keys.length > 10)
                                    break; // Limit iteration
                            }
                            return keys;
                        })());
                        break;
                }
            }
            // All operations should complete without throwing
            const results = await Promise.allSettled(operations);
            const failures = results.filter((r) => r.status === "rejected");
            expect(failures).toEqual([]);
        });
    });
});
//# sourceMappingURL=concurrency.chaos.test.js.map