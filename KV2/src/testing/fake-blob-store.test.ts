import { BlobPreconditionFailedError } from "@vercel/blob";
import { FakeBlobStore } from "./fake-blob-store.js";
import { describe, expect, it } from "./vitest-compat.js";

describe("FakeBlobStore", () => {
  describe("allowOverwrite: false", () => {
    it("allows first write", async () => {
      const store = new FakeBlobStore();
      const result = await store.put("key", "value", {
        access: "private",
        allowOverwrite: false,
      });
      expect(result.etag).toBeTruthy();
    });

    it("rejects second write to same key", async () => {
      const store = new FakeBlobStore();
      await store.put("key", "value", {
        access: "private",
        allowOverwrite: false,
      });

      let threw = false;
      try {
        await store.put("key", "value2", {
          access: "private",
          allowOverwrite: false,
        });
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(BlobPreconditionFailedError);
      }
      expect(threw).toBe(true);
    });

    it("allows write after delete", async () => {
      const store = new FakeBlobStore();
      await store.put("key", "value", {
        access: "private",
        allowOverwrite: false,
      });
      await store.del("key");

      const result = await store.put("key", "value2", {
        access: "private",
        allowOverwrite: false,
      });
      expect(result.etag).toBeTruthy();
    });
  });

  describe("ifMatch (etag enforcement)", () => {
    it("succeeds when etag matches", async () => {
      const store = new FakeBlobStore();
      const first = await store.put("key", "value", { access: "private" });

      const result = await store.put("key", "updated", {
        access: "private",
        ifMatch: first.etag,
      });
      expect(result.etag).not.toBe(first.etag);
    });

    it("rejects when etag does not match", async () => {
      const store = new FakeBlobStore();
      await store.put("key", "value", { access: "private" });

      let threw = false;
      try {
        await store.put("key", "updated", {
          access: "private",
          ifMatch: '"wrong-etag"',
        });
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(BlobPreconditionFailedError);
      }
      expect(threw).toBe(true);
    });

    it("rejects when key does not exist", async () => {
      const store = new FakeBlobStore();

      let threw = false;
      try {
        await store.put("missing", "value", {
          access: "private",
          ifMatch: '"some-etag"',
        });
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(BlobPreconditionFailedError);
      }
      expect(threw).toBe(true);
    });
  });

  describe("concurrency with allowOverwrite: false", () => {
    it("rejects concurrent writes to the same key (non-streaming)", async () => {
      const store = new FakeBlobStore();

      // Launch two concurrent writes with allowOverwrite: false
      const results = await Promise.allSettled([
        store.put("key", Buffer.from("writer-1"), {
          access: "private",
          allowOverwrite: false,
        }),
        store.put("key", Buffer.from("writer-2"), {
          access: "private",
          allowOverwrite: false,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly one should succeed, one should fail
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it("rejects concurrent writes to the same key (streaming)", async () => {
      const store = new FakeBlobStore();

      function slowStream(data: string): ReadableStream<Uint8Array> {
        return new ReadableStream({
          async start(controller) {
            // Yield to event loop to create a real async gap
            await new Promise((r) => setTimeout(r, 10));
            controller.enqueue(new TextEncoder().encode(data));
            controller.close();
          },
        });
      }

      const results = await Promise.allSettled([
        store.put("key", slowStream("writer-1"), {
          access: "private",
          allowOverwrite: false,
        }),
        store.put("key", slowStream("writer-2"), {
          access: "private",
          allowOverwrite: false,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // With streaming bodies, both pass the check before either writes.
      // This test documents the race condition.
      // If FakeBlobStore is fixed, exactly one should succeed:
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  describe("concurrency with ifMatch", () => {
    it("rejects concurrent conditional updates (non-streaming)", async () => {
      const store = new FakeBlobStore();
      const first = await store.put("key", "initial", { access: "private" });

      const results = await Promise.allSettled([
        store.put("key", Buffer.from("writer-1"), {
          access: "private",
          ifMatch: first.etag,
        }),
        store.put("key", Buffer.from("writer-2"), {
          access: "private",
          ifMatch: first.etag,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });

    it("rejects concurrent conditional updates (streaming)", async () => {
      const store = new FakeBlobStore();
      const first = await store.put("key", "initial", { access: "private" });

      function slowStream(data: string): ReadableStream<Uint8Array> {
        return new ReadableStream({
          async start(controller) {
            await new Promise((r) => setTimeout(r, 10));
            controller.enqueue(new TextEncoder().encode(data));
            controller.close();
          },
        });
      }

      const results = await Promise.allSettled([
        store.put("key", slowStream("writer-1"), {
          access: "private",
          ifMatch: first.etag,
        }),
        store.put("key", slowStream("writer-2"), {
          access: "private",
          ifMatch: first.etag,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // With streaming bodies, both pass the etag check before either writes.
      // This test documents the race condition.
      // If FakeBlobStore is fixed, exactly one should succeed:
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });
});
