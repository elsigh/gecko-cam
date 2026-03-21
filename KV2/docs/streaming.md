[Home](../README.md) | [Previous: Caching](caching.md) | [Next: Copy-on-Write Branches](copy-on-write-branches.md)

# Streaming

## Why Streaming?

By default, `result.value` buffers the entire value into memory before returning it. For a 2 KB JSON object that's fine, but for a 50 MB image or a large dataset it means your serverless function allocates 50 MB of RAM just to pass the bytes through to a response.

Streaming avoids this. With `result.stream` you get a `ReadableStream<Uint8Array>` that flows bytes directly from blob storage to the consumer — memory stays flat regardless of value size.

Use streaming when you're:
- Serving files or media to clients without processing them
- Piping data between storage and another service
- Working near your function's memory limit

## Streaming Reads

Use `result.stream` instead of `result.value` to read without buffering:

```typescript
const result = await kv.get("large-file");
if (result.exists) {
  const stream = await result.stream;
  // Pipe directly to the HTTP response — no buffering
  const response = new Response(stream);
}
```

## Streaming Writes

Pass a `ReadableStream<Uint8Array>` to `set()` to write without buffering the full payload:

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("hello world"));
    controller.close();
  },
});

await kv.set("streamed-value", stream, metadata);
```

This is useful for proxying uploads or piping data from another source directly into the store.

## Large Value Threshold

Values below the threshold (default: 1 MB) are inlined in a single JSON blob — small and fast. Values above it are stored in a binary format that separates the header (metadata) from the payload, enabling streaming without parsing the entire blob.

You can tune the threshold:

```typescript
import { KV2 } from "@vercel/kv2";

const kv = new KV2({
  prefix: "files/",
  largeValueThreshold: 512 * 1024, // 512KB
});
```

Lower it if you serve many medium-sized values and want to stream them. Raise it (or leave the default) if your values are mostly small JSON and you want the simplicity of a single fetch.
