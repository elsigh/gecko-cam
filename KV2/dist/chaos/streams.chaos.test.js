import { describe, expect } from "../testing/vitest-compat.js";
import { FakeBlobStore, KV2, it, setupChaosContext, uniqueTestPrefix, } from "./chaos-test-setup.js";
/**
 * Chaos tests for stream handling.
 * These tests explore edge cases in streaming input/output, chunking, and interruptions.
 */
describe("Chaos: Streams", () => {
    setupChaosContext();
    describe("chunking edge cases", () => {
        it("should handle stream with many tiny chunks", async (ctx) => {
            const { kv } = ctx;
            const chunkCount = 1000;
            const chunks = Array.from({ length: chunkCount }, (_, i) => Buffer.from([i % 256]));
            const stream = new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(chunk);
                    }
                    controller.close();
                },
            });
            await kv.set("tiny-chunks", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("tiny-chunks");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(chunkCount);
                for (let i = 0; i < chunkCount; i++) {
                    expect(value[i]).toBe(i % 256);
                }
            }
        });
        it("should handle stream with single massive chunk", async (ctx) => {
            const { kv } = ctx;
            const size = 500_000; // 500KB
            const data = Buffer.alloc(size, 0xab);
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("massive-chunk", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("massive-chunk");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(size);
                expect(value.every((b) => b === 0xab)).toBe(true);
            }
        });
        it("should handle irregular chunk sizes", async (ctx) => {
            const { kv } = ctx;
            // Chunks of varying sizes: 1, 10, 100, 1000, 10, 1, 500, etc.
            const chunkSizes = [
                1, 10, 100, 1000, 10, 1, 500, 3, 77, 999, 1, 1, 1, 2048,
            ];
            const chunks = chunkSizes.map((size, i) => Buffer.alloc(size, i % 256));
            const expected = Buffer.concat(chunks);
            const stream = new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(chunk);
                    }
                    controller.close();
                },
            });
            await kv.set("irregular-chunks", stream, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("irregular-chunks");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toEqual(expected);
            }
        });
        it("should handle zero-length chunks interspersed", async (ctx) => {
            const { kv } = ctx;
            const chunks = [
                Buffer.from("hello"),
                Buffer.from(""), // empty
                Buffer.from("world"),
                Buffer.from(""), // empty
                Buffer.from(""), // empty
                Buffer.from("!"),
            ];
            const stream = new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(chunk);
                    }
                    controller.close();
                },
            });
            await kv.set("empty-chunks", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("empty-chunks");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.toString()).toBe("helloworld!");
            }
        });
    });
    describe("empty and null edge cases", () => {
        it("should handle completely empty stream", async (ctx) => {
            const { kv } = ctx;
            const stream = new ReadableStream({
                start(controller) {
                    controller.close();
                },
            });
            await kv.set("empty-stream", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("empty-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(0);
            }
        });
        it("should handle stream that only produces empty chunks then closes", async (ctx) => {
            const { kv } = ctx;
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(Buffer.from(""));
                    controller.enqueue(Buffer.from(""));
                    controller.enqueue(Buffer.from(""));
                    controller.close();
                },
            });
            await kv.set("all-empty-chunks", stream, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("all-empty-chunks");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(0);
            }
        });
    });
    describe("async stream production", () => {
        it("should handle slow stream with delays between chunks", async (ctx) => {
            const { kv } = ctx;
            const chunks = [
                Buffer.from("chunk1"),
                Buffer.from("chunk2"),
                Buffer.from("chunk3"),
            ];
            let chunkIndex = 0;
            const stream = new ReadableStream({
                async pull(controller) {
                    if (chunkIndex < chunks.length) {
                        await new Promise((r) => setTimeout(r, 10));
                        controller.enqueue(chunks[chunkIndex++]);
                    }
                    else {
                        controller.close();
                    }
                },
            });
            await kv.set("slow-stream", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("slow-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.toString()).toBe("chunk1chunk2chunk3");
            }
        });
        it("should handle backpressure scenarios", async (ctx) => {
            const { kv } = ctx;
            // Create a stream that produces data faster than it might be consumed
            const totalChunks = 100;
            let produced = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (produced < totalChunks) {
                        const chunk = Buffer.alloc(1024, produced % 256);
                        controller.enqueue(chunk);
                        produced++;
                    }
                    else {
                        controller.close();
                    }
                },
            });
            await kv.set("backpressure", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("backpressure");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value.length).toBe(totalChunks * 1024);
            }
        });
    });
    describe("output stream reading patterns", () => {
        it("should handle partial stream read then abandon", async (ctx) => {
            const { kv } = ctx;
            const data = Buffer.from("this is test data for partial reading");
            await kv.set("partial-read-target", data, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("partial-read-target");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const stream = await result.stream;
                const reader = stream.getReader();
                // Read only first chunk and abandon
                const { value } = await reader.read();
                expect(value).toBeDefined();
                expect(value?.length).toBeGreaterThan(0);
                // Cancel the stream
                await reader.cancel();
                // Should still be able to get the full value
                const fullValue = await result.value;
                expect(fullValue).toEqual(data);
            }
        });
        it("should handle multiple sequential stream reads from same result", async (ctx) => {
            const { kv } = ctx;
            const data = Buffer.from("data for multiple reads");
            await kv.set("multi-stream", data, { createdBy: "test", version: 1 });
            const result = await kv.get("multi-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                // First stream read
                const stream1 = await result.stream;
                const reader1 = stream1.getReader();
                const chunks1 = [];
                while (true) {
                    const { done, value } = await reader1.read();
                    if (done)
                        break;
                    chunks1.push(value);
                }
                expect(Buffer.concat(chunks1)).toEqual(data);
                // Second stream access returns the same cached promise/stream
                // ReadableStream can only be read once - attempting to get another reader
                // on a locked stream throws an error. This is expected behavior.
                const stream2 = await result.stream;
                // stream1 and stream2 are the same object (lazy cached)
                expect(stream2).toBe(stream1);
                // The stream is already locked/consumed, so getting another reader fails
                expect(() => stream2.getReader()).toThrow();
            }
        });
        it("should handle interleaved value and stream access", async (ctx) => {
            const { kv } = ctx;
            const data = Buffer.from("interleaved access test data");
            await kv.set("interleaved", data, { createdBy: "test", version: 1 });
            const result = await kv.get("interleaved");
            expect(result.exists).toBe(true);
            if (result.exists) {
                // Access in various orders
                const [stream, value1, value2] = await Promise.all([
                    result.stream,
                    result.value,
                    result.value,
                ]);
                expect(value1).toEqual(data);
                expect(value2).toEqual(data);
                expect(stream).toBeInstanceOf(ReadableStream);
            }
        });
    });
    describe("binary data edge cases", () => {
        it("should handle stream containing all byte values", async (ctx) => {
            const { kv } = ctx;
            // Every possible byte value 0-255
            const data = Buffer.alloc(256);
            for (let i = 0; i < 256; i++) {
                data[i] = i;
            }
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("all-bytes-stream", stream, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("all-bytes-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect(value).toEqual(data);
            }
        });
        it("should handle stream with null bytes", async (ctx) => {
            const { kv } = ctx;
            const data = Buffer.from([0, 1, 0, 0, 2, 0, 3, 0, 0, 0]);
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("null-bytes", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("null-bytes");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toEqual(data);
            }
        });
        it("should handle stream that looks like JSON but isn't", async (ctx) => {
            const { kv } = ctx;
            // Data that starts with JSON-like characters but is binary
            const data = Buffer.from('{"fake": "json", but then \x00\x01\x02 binary');
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("fake-json-stream", stream, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("fake-json-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                expect(await result.value).toEqual(data);
            }
        });
    });
    describe("TypedArray variants", () => {
        it("should handle Uint8Array stream input", async (ctx) => {
            const { kv } = ctx;
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await kv.set("uint8array-stream", stream, {
                createdBy: "test",
                version: 1,
            });
            const result = await kv.get("uint8array-stream");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect([...value]).toEqual([...data]);
            }
        });
        it("should handle ArrayBuffer-backed Uint8Array with offset", async (ctx) => {
            const { kv } = ctx;
            const buffer = new ArrayBuffer(10);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < 10; i++)
                view[i] = i;
            // Create a view with offset
            const offsetView = new Uint8Array(buffer, 2, 5); // [2, 3, 4, 5, 6]
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(offsetView);
                    controller.close();
                },
            });
            await kv.set("offset-view", stream, { createdBy: "test", version: 1 });
            const result = await kv.get("offset-view");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const value = await result.value;
                expect([...value]).toEqual([2, 3, 4, 5, 6]);
            }
        });
    });
    describe("stream cancellation", () => {
        it("should propagate cancel to source streams in concatStreams", async (ctx) => {
            const { blobStore } = ctx;
            // Track whether our input streams were cancelled
            let stream1Cancelled = false;
            const inputStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(Buffer.from("chunk1"));
                },
                pull(controller) {
                    // Keep pulling slowly
                    return new Promise((resolve) => setTimeout(resolve, 100));
                },
                cancel() {
                    stream1Cancelled = true;
                },
            });
            // Create a custom blob store that cancels mid-upload
            const cancellingBlobStore = {
                ...blobStore,
                async put(path, body) {
                    const reader = body.getReader();
                    // Read first chunk then cancel
                    await reader.read();
                    await reader.cancel();
                    // Return a proper PutBlobResult
                    return {
                        url: `fake://${path}`,
                        downloadUrl: `fake://${path}`,
                        pathname: path,
                        contentType: "application/octet-stream",
                        contentDisposition: "",
                        etag: `"fake-etag-${Date.now()}"`,
                    };
                },
            };
            const cancelKv = new KV2({
                prefix: uniqueTestPrefix(),
                blobStore: cancellingBlobStore,
            });
            // This should trigger the cancel callback in concatStreams
            await cancelKv.set("cancel-test", inputStream, {
                createdBy: "test",
                version: 1,
            });
            // Give time for cancel to propagate
            await new Promise((r) => setTimeout(r, 50));
            // The input stream should have been cancelled
            expect(stream1Cancelled).toBe(true);
        });
    });
    describe("stream error handling", () => {
        it("should handle stream that errors after some data", async (ctx) => {
            const { kv } = ctx;
            let chunksSent = 0;
            const stream = new ReadableStream({
                pull(controller) {
                    if (chunksSent < 3) {
                        controller.enqueue(Buffer.from(`chunk${chunksSent}`));
                        chunksSent++;
                    }
                    else {
                        controller.error(new Error("Stream failed!"));
                    }
                },
            });
            // This might either fail or succeed depending on implementation
            await expect(kv.set("error-stream", stream, { createdBy: "test", version: 1 })).rejects.toThrow();
        });
        it("should handle stream that errors immediately", async (ctx) => {
            const { kv } = ctx;
            const stream = new ReadableStream({
                start(controller) {
                    controller.error(new Error("Immediate error"));
                },
            });
            await expect(kv.set("immediate-error", stream, { createdBy: "test", version: 1 })).rejects.toThrow();
        });
    });
    describe("stream output edge cases", () => {
        it("should produce valid stream for small JSON value", async (ctx) => {
            const { kv } = ctx;
            const value = { small: "json" };
            await kv.set("small-json", value, { createdBy: "test", version: 1 });
            const result = await kv.get("small-json");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const stream = await result.stream;
                const reader = stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value: chunk } = await reader.read();
                    if (done)
                        break;
                    chunks.push(chunk);
                }
                const data = Buffer.concat(chunks);
                // The stream should contain valid data that can be parsed back
                expect(data.length).toBeGreaterThan(0);
            }
        });
        it("should produce valid stream for large binary value", async (ctx) => {
            const { kv: largeKv, cleanup } = createLargeThresholdKV();
            const binary = Buffer.alloc(1000, 0xcc);
            await largeKv.set("large-binary", binary, {
                createdBy: "test",
                version: 1,
            });
            const result = await largeKv.get("large-binary");
            expect(result.exists).toBe(true);
            if (result.exists) {
                const stream = await result.stream;
                const reader = stream.getReader();
                const chunks = [];
                while (true) {
                    const { done, value: chunk } = await reader.read();
                    if (done)
                        break;
                    chunks.push(chunk);
                }
                expect(Buffer.concat(chunks)).toEqual(binary);
            }
            await cleanup();
        });
    });
});
function createLargeThresholdKV() {
    const prefix = uniqueTestPrefix();
    const blobStore = new FakeBlobStore();
    const kv = new KV2({
        prefix,
        blobStore,
        largeValueThreshold: 100, // Very low threshold
    });
    return { kv, cleanup: () => Promise.resolve(blobStore.clear()) };
}
//# sourceMappingURL=streams.chaos.test.js.map