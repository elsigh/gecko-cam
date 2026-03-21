import { createTestKV, it, setupTestContext } from "./testing/test-setup.js";
import { describe, expect } from "./testing/vitest-compat.js";
describe("KV2 binary values", () => {
    setupTestContext();
    it("stores and retrieves Buffer values", async (ctx) => {
        const { kv } = ctx;
        const buffer = Buffer.from([1, 2, 3, 4, 5]);
        await kv.set("binary", buffer, { createdBy: "test", version: 1 });
        const result = await kv.get("binary");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const value = await result.value;
            expect(Buffer.isBuffer(value)).toBe(true);
            expect(value).toEqual(buffer);
        }
    });
    it("stores and retrieves Uint8Array values", async (ctx) => {
        const { kv } = ctx;
        const array = new Uint8Array([10, 20, 30]);
        await kv.set("uint8", array, { createdBy: "test", version: 1 });
        const result = await kv.get("uint8");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const value = await result.value;
            expect(Buffer.from(value).toString("hex")).toBe(Buffer.from(array).toString("hex"));
        }
    });
    it("stores and retrieves empty Buffer", async (ctx) => {
        const { kv } = ctx;
        const buffer = Buffer.alloc(0);
        await kv.set("empty-buffer", buffer, { createdBy: "test", version: 1 });
        const result = await kv.get("empty-buffer");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const value = await result.value;
            expect(value.length).toBe(0);
        }
    });
    it("stores and retrieves binary data with all byte values", async (ctx) => {
        const { kv } = ctx;
        // Create buffer with all possible byte values (0-255)
        const buffer = Buffer.alloc(256);
        for (let i = 0; i < 256; i++) {
            buffer[i] = i;
        }
        await kv.set("all-bytes", buffer, { createdBy: "test", version: 1 });
        const result = await kv.get("all-bytes");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(buffer);
        }
    });
    it("streams binary values", async (ctx) => {
        const { kv } = ctx;
        const buffer = Buffer.from([1, 2, 3, 4, 5]);
        await kv.set("stream-binary", buffer, { createdBy: "test", version: 1 });
        const result = await kv.get("stream-binary");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const stream = await result.stream;
            const reader = stream.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            expect(Buffer.concat(chunks)).toEqual(buffer);
        }
    });
});
describe("KV2 large values", () => {
    it("stores and retrieves large string values", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        const largeValue = "this is a large value that exceeds threshold";
        await largeKv.set("large", largeValue, {
            createdBy: "test",
            version: 1,
        });
        // Large JSON values (including strings) are automatically parsed when retrieved
        const result = await largeKv.get("large");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe(largeValue);
        }
        await largeCleanup();
    });
    it("stores and retrieves large JSON objects", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        const largeObj = {
            data: Array.from({ length: 100 }, (_, i) => ({
                id: i,
                name: `item-${i}`,
            })),
        };
        await largeKv.set("large-obj", largeObj, {
            createdBy: "test",
            version: 1,
        });
        // Large JSON objects are automatically parsed when retrieved
        const result = await largeKv.get("large-obj");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(largeObj);
        }
        await largeCleanup();
    });
    it("stores and retrieves large binary values", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        const largeBinary = Buffer.alloc(1000, 0xab);
        await largeKv.set("large-binary", largeBinary, {
            createdBy: "test",
            version: 1,
        });
        const result = await largeKv.get("large-binary");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(largeBinary);
        }
        await largeCleanup();
    });
    it("deletes large value", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        await largeKv.set("large", "this is a large value", {
            createdBy: "test",
            version: 1,
        });
        await largeKv.delete("large");
        const result = await largeKv.get("large");
        expect(result.exists).toBe(false);
        await largeCleanup();
    });
    it("lists large values", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        await largeKv.set("large1", "this is large value one", {
            createdBy: "test",
            version: 1,
        });
        await largeKv.set("large2", "this is large value two", {
            createdBy: "test",
            version: 1,
        });
        await largeKv.set("small", "tiny", { createdBy: "test", version: 1 });
        const keys = [];
        for await (const key of largeKv.keys()) {
            keys.push(key);
        }
        expect(keys.sort()).toEqual(["large1", "large2", "small"]);
        await largeCleanup();
    });
    it("streams large values", async () => {
        const { kv: largeKv, cleanup: largeCleanup } = createTestKV({
            largeValueThreshold: 10,
        });
        const largeBinary = Buffer.alloc(1000, 0xab);
        await largeKv.set("stream-large", largeBinary, {
            createdBy: "test",
            version: 1,
        });
        const result = await largeKv.get("stream-large");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const stream = await result.stream;
            const reader = stream.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            expect(Buffer.concat(chunks)).toEqual(largeBinary);
        }
        await largeCleanup();
    });
});
describe("KV2 streaming input", () => {
    setupTestContext();
    it("accepts ReadableStream as value", async (ctx) => {
        const { kv } = ctx;
        const data = Buffer.from("streamed data content");
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(data);
                controller.close();
            },
        });
        await kv.set("stream-input", inputStream, {
            createdBy: "test",
            version: 1,
        });
        const result = await kv.get("stream-input");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(data);
        }
    });
    it("handles multi-chunk stream", async (ctx) => {
        const { kv } = ctx;
        const chunk1 = Buffer.from("chunk1");
        const chunk2 = Buffer.from("chunk2");
        const chunk3 = Buffer.from("chunk3");
        const expected = Buffer.concat([chunk1, chunk2, chunk3]);
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(chunk1);
                controller.enqueue(chunk2);
                controller.enqueue(chunk3);
                controller.close();
            },
        });
        await kv.set("multi-chunk", inputStream, {
            createdBy: "test",
            version: 1,
        });
        const result = await kv.get("multi-chunk");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(expected);
        }
    });
    it("can stream output after streaming input", async (ctx) => {
        const { kv } = ctx;
        const data = Buffer.from("stream in, stream out");
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(data);
                controller.close();
            },
        });
        await kv.set("stream-round-trip", inputStream, {
            createdBy: "test",
            version: 1,
        });
        const result = await kv.get("stream-round-trip");
        expect(result.exists).toBe(true);
        if (result.exists) {
            const stream = await result.stream;
            const reader = stream.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                chunks.push(value);
            }
            expect(Buffer.concat(chunks)).toEqual(data);
        }
    });
    it("streaming input always uses large file mode", async (ctx) => {
        const { kv } = ctx;
        // Even small data via stream uses raw-binary encoding
        const smallData = Buffer.from("tiny");
        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(smallData);
                controller.close();
            },
        });
        await kv.set("small-stream", inputStream, {
            createdBy: "test",
            version: 1,
        });
        const result = await kv.get("small-stream");
        expect(result.exists).toBe(true);
        if (result.exists) {
            // Value should be a Buffer (binary), not parsed JSON
            const value = await result.value;
            expect(Buffer.isBuffer(value)).toBe(true);
            expect(value).toEqual(smallData);
        }
    });
});
describe("KV2 edge cases", () => {
    setupTestContext();
    it("handles empty string value", async (ctx) => {
        const { kv } = ctx;
        await kv.set("empty-string", "", { createdBy: "test", version: 1 });
        const result = await kv.get("empty-string");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe("");
        }
    });
    it("handles keys with special characters", async (ctx) => {
        const { kv } = ctx;
        const specialKey = "path/to/file.json";
        await kv.set(specialKey, "value", { createdBy: "test", version: 1 });
        const result = await kv.get(specialKey);
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe("value");
        }
    });
    it("handles keys with unicode characters", async (ctx) => {
        const { kv } = ctx;
        const unicodeKey = "emoji-🎉-key";
        await kv.set(unicodeKey, "celebration", { createdBy: "test", version: 1 });
        const result = await kv.get(unicodeKey);
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe("celebration");
        }
    });
    it("handles values with unicode characters", async (ctx) => {
        const { kv } = ctx;
        const unicodeValue = "Hello 世界 🌍";
        await kv.set("unicode-value", unicodeValue, {
            createdBy: "test",
            version: 1,
        });
        const result = await kv.get("unicode-value");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toBe(unicodeValue);
        }
    });
    it("handles metadata with special characters", async (ctx) => {
        const { kv } = ctx;
        await kv.set("meta-test", "value", {
            createdBy: "user@example.com/admin",
            version: 1,
        });
        const result = await kv.get("meta-test");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(result.metadata.createdBy).toBe("user@example.com/admin");
        }
    });
    it("handles deeply nested objects", async (ctx) => {
        const { kv } = ctx;
        const deepObj = {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            level5: { value: "deep" },
                        },
                    },
                },
            },
        };
        await kv.set("deep", deepObj, { createdBy: "test", version: 1 });
        const result = await kv.get("deep");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(deepObj);
        }
    });
    it("handles object with many keys", async (ctx) => {
        const { kv } = ctx;
        const manyKeys = {};
        for (let i = 0; i < 100; i++) {
            manyKeys[`key${i}`] = i;
        }
        await kv.set("many-keys", manyKeys, { createdBy: "test", version: 1 });
        const result = await kv.get("many-keys");
        expect(result.exists).toBe(true);
        if (result.exists) {
            expect(await result.value).toEqual(manyKeys);
        }
    });
});
//# sourceMappingURL=cached-kv.values.test.js.map