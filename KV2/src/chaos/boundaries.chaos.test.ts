import { describe, expect } from "../testing/vitest-compat.js";
import {
  FakeBlobStore,
  KV2,
  type PrefixString,
  type TestMetadata,
  afterEach,
  beforeEach,
  it,
  uniqueTestPrefix,
} from "./chaos-test-setup.js";

interface BoundariesTestContext {
  blobStore: FakeBlobStore;
  prefix: PrefixString;
}

/**
 * Chaos tests for boundary conditions.
 * These tests explore size thresholds, encoding edge cases, and value type boundaries.
 */
describe("Chaos: Boundaries", () => {
  beforeEach((ctx) => {
    ctx.prefix = uniqueTestPrefix();
    ctx.blobStore = new FakeBlobStore();
  });

  afterEach((ctx) => {
    ctx.blobStore.clear();
  });

  describe("large value threshold boundaries", () => {
    it("should handle value exactly at threshold", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const threshold = 100;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: threshold,
      });

      // JSON serialization adds overhead, so we need to account for that
      // A simple string "X" becomes '"X"' (3 bytes), so we subtract 2
      const exactValue = "X".repeat(threshold - 2); // After JSON.stringify this is exactly threshold
      await kv.set("exact", exactValue, { createdBy: "test", version: 1 });

      const result = await kv.get<string>("exact");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe(exactValue);
      }
    });

    it("should handle value one byte under threshold", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const threshold = 100;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: threshold,
      });

      const underValue = "X".repeat(threshold - 3);
      await kv.set("under", underValue, { createdBy: "test", version: 1 });

      const result = await kv.get<string>("under");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe(underValue);
      }
    });

    it("should handle value one byte over threshold", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const threshold = 100;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: threshold,
      });

      const overValue = "X".repeat(threshold - 1);
      await kv.set("over", overValue, { createdBy: "test", version: 1 });

      const result = await kv.get<string>("over");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe(overValue);
      }
    });

    it("should correctly choose encoding at boundary for binary", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const threshold = 100;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: threshold,
      });

      // Base64 encoding increases size by ~33%
      // 75 bytes becomes 100 base64 chars
      const binaryUnder = Buffer.alloc(74, 0xab);
      const binaryOver = Buffer.alloc(76, 0xcd);

      await kv.set("binary-under", binaryUnder, {
        createdBy: "test",
        version: 1,
      });
      await kv.set("binary-over", binaryOver, {
        createdBy: "test",
        version: 1,
      });

      const resultUnder = await kv.get<Buffer>("binary-under");
      const resultOver = await kv.get<Buffer>("binary-over");

      expect(resultUnder.exists).toBe(true);
      expect(resultOver.exists).toBe(true);

      if (resultUnder.exists && resultOver.exists) {
        expect(await resultUnder.value).toEqual(binaryUnder);
        expect(await resultOver.value).toEqual(binaryOver);
      }
    });

    it("should handle threshold of 1", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 1,
      });

      // Even the smallest value should trigger large value mode
      await kv.set("tiny", "a", { createdBy: "test", version: 1 });

      const result = await kv.get<string>("tiny");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("a");
      }
    });

    it("should handle threshold of 0", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 0,
      });

      // Everything should be large value mode
      await kv.set("zero-threshold", "test", { createdBy: "test", version: 1 });

      const result = await kv.get<string>("zero-threshold");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("test");
      }
    });

    it("should handle very large threshold", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 100_000_000, // 100MB
      });

      // Normal sized value should work fine
      const value = { data: "test", nested: { more: "data" } };
      await kv.set("huge-threshold", value, { createdBy: "test", version: 1 });

      const result = await kv.get<typeof value>("huge-threshold");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toEqual(value);
      }
    });
  });

  describe("key boundaries", () => {
    it("should reject empty key", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      await expect(
        kv.set("", "empty-key-value", { createdBy: "test", version: 1 }),
      ).rejects.toThrow("Key cannot be empty");
      await expect(kv.get("")).rejects.toThrow("Key cannot be empty");
    });

    it("should handle very long key", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const longKey = "a".repeat(1000);
      await kv.set(longKey, "long-key-value", {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<string>(longKey);
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("long-key-value");
      }
    });

    it("should handle key with only special characters", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const specialKey = "...///...";
      await kv.set(specialKey, "special", { createdBy: "test", version: 1 });

      const result = await kv.get<string>(specialKey);
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("special");
      }
    });

    it("should handle key with unicode characters", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const unicodeKey = "日本語キー/путь/🔑";
      await kv.set(unicodeKey, "unicode-value", {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<string>(unicodeKey);
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("unicode-value");
      }
    });

    it("should handle key with newlines and tabs", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const whitespaceKey = "line1\nline2\ttab";
      await kv.set(whitespaceKey, "whitespace", {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<string>(whitespaceKey);
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("whitespace");
      }
    });

    it("should handle key with null-like values", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const keys = ["null", "undefined", "0", "false", "NaN"];

      for (const key of keys) {
        await kv.set(key, `value-for-${key}`, {
          createdBy: "test",
          version: 1,
        });
      }

      for (const key of keys) {
        const result = await kv.get<string>(key);
        expect(result.exists, `Key "${key}" should exist`).toBe(true);
        if (result.exists) {
          expect(await result.value).toBe(`value-for-${key}`);
        }
      }
    });
  });

  describe("value type boundaries", () => {
    it("should handle null value", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      await kv.set("null-value", null, { createdBy: "test", version: 1 });

      const result = await kv.get<null>("null-value");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBeNull();
      }
    });

    it("should reject undefined value", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      let threw = false;
      try {
        // biome-ignore lint/suspicious/noExplicitAny: testing that undefined is rejected at runtime
        await kv.set("undefined-value", undefined as any, {
          createdBy: "test",
          version: 1,
        });
      } catch (e: unknown) {
        threw = true;
        expect((e as Error).message).toContain("undefined");
      }
      expect(threw).toBe(true);
    });

    it("should handle boolean values", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      await kv.set("true", true, { createdBy: "test", version: 1 });
      await kv.set("false", false, { createdBy: "test", version: 1 });

      const trueResult = await kv.get<boolean>("true");
      const falseResult = await kv.get<boolean>("false");

      expect(trueResult.exists && (await trueResult.value)).toBe(true);
      expect(falseResult.exists).toBe(true);
      if (falseResult.exists) {
        expect(await falseResult.value).toBe(false);
      }
    });

    it("should handle number edge cases", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const numbers = [
        0,
        -0, // Note: -0 becomes +0 in JSON (they're equal in JSON.stringify)
        1,
        -1,
        0.1,
        -0.1,
        Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        // NaN becomes null in JSON
      ];

      for (let i = 0; i < numbers.length; i++) {
        await kv.set(`num-${i}`, numbers[i], { createdBy: "test", version: 1 });
      }

      for (let i = 0; i < numbers.length; i++) {
        const result = await kv.get<number>(`num-${i}`);
        expect(result.exists).toBe(true);
        if (result.exists) {
          const value = await result.value;
          if (Number.isFinite(numbers[i])) {
            // Note: -0 becomes +0 in JSON, so we use toEqual instead of toBe
            // for the -0 case to avoid Object.is strict equality
            if (Object.is(numbers[i], -0)) {
              expect(value).toEqual(0); // -0 becomes 0 in JSON
            } else {
              expect(value).toBe(numbers[i]);
            }
          } else {
            // Infinity becomes null in JSON
            expect(value).toBeNull();
          }
        }
      }
    });

    it("should handle NaN (becomes null in JSON)", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      await kv.set("nan", Number.NaN, { createdBy: "test", version: 1 });

      const result = await kv.get("nan");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBeNull();
      }
    });

    it("should handle arrays with holes (sparse arrays)", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const sparse = [1, undefined, undefined, 4, undefined, 6]; // holes become null in JSON

      await kv.set("sparse", sparse, { createdBy: "test", version: 1 });

      const result = await kv.get<(number | null)[]>("sparse");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value[0]).toBe(1);
        expect(value[1]).toBeNull();
        expect(value[2]).toBeNull();
        expect(value[3]).toBe(4);
        expect(value[4]).toBeNull();
        expect(value[5]).toBe(6);
      }
    });

    it("should handle object with symbol keys (symbols are ignored in JSON)", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const sym = Symbol("test");
      const obj = { [sym]: "ignored", visible: "kept" };

      await kv.set("symbol-obj", obj, { createdBy: "test", version: 1 });

      const result = await kv.get<Record<string, string>>("symbol-obj");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.visible).toBe("kept");
        expect(Object.keys(value)).toEqual(["visible"]);
      }
    });

    it("should handle Date objects (become strings in JSON)", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const date = new Date("2024-01-15T12:30:00.000Z");

      await kv.set("date", date, { createdBy: "test", version: 1 });

      const result = await kv.get<string>("date");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value).toBe("2024-01-15T12:30:00.000Z");
      }
    });

    it("should handle BigInt (throws in JSON.stringify)", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });

      await expect(
        kv.set("bigint", BigInt(12345), { createdBy: "test", version: 1 }),
      ).rejects.toThrow();
    });

    it("should handle circular reference detection", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      await expect(
        kv.set("circular", circular, { createdBy: "test", version: 1 }),
      ).rejects.toThrow();
    });
  });

  describe("metadata boundaries", () => {
    it("should handle empty metadata object", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<Record<string, never>>({ prefix, blobStore });
      await kv.set("empty-meta", "value", {});

      const result = await kv.get<string>("empty-meta");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toEqual({});
      }
    });

    it("should handle metadata with many fields", async (ctx) => {
      const { prefix, blobStore } = ctx;
      interface BigMeta {
        [key: string]: number;
      }
      const kv = new KV2<BigMeta>({ prefix, blobStore });
      const meta: BigMeta = {};
      for (let i = 0; i < 100; i++) {
        meta[`field${i}`] = i;
      }

      await kv.set("big-meta", "value", meta);

      const result = await kv.get<string>("big-meta");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toEqual(meta);
      }
    });

    it("should handle metadata with deeply nested structure", async (ctx) => {
      const { prefix, blobStore } = ctx;
      interface DeepMeta {
        level1: { level2: { level3: { level4: { level5: string } } } };
      }
      const kv = new KV2<DeepMeta>({ prefix, blobStore });
      const meta: DeepMeta = {
        level1: { level2: { level3: { level4: { level5: "deep" } } } },
      };

      await kv.set("deep-meta", "value", meta);

      const result = await kv.get<string>("deep-meta");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toEqual(meta);
      }
    });

    it("should handle metadata with unicode", async (ctx) => {
      const { prefix, blobStore } = ctx;
      interface UnicodeMeta {
        name: string;
        emoji: string;
      }
      const kv = new KV2<UnicodeMeta>({ prefix, blobStore });
      const meta: UnicodeMeta = {
        name: "日本語",
        emoji: "🚀🎉",
      };

      await kv.set("unicode-meta", "value", meta);

      const result = await kv.get<string>("unicode-meta");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata).toEqual(meta);
      }
    });
  });

  describe("header length boundaries", () => {
    it("should handle header that approaches 4-byte length limit", async (ctx) => {
      const { prefix, blobStore } = ctx;
      // The header length is stored as uint32, max ~4GB
      // We can't test actual 4GB, but we can test with large metadata
      interface LargeMeta {
        data: string;
      }
      const kv = new KV2<LargeMeta>({ prefix, blobStore });
      const largeMeta: LargeMeta = {
        data: "x".repeat(10000), // 10KB of metadata
      };

      await kv.set("large-header", "value", largeMeta);

      const result = await kv.get<string>("large-header");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(result.metadata.data.length).toBe(10000);
      }
    });

    it("should handle minimal header", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 1000000, // High threshold to inline values
      });

      await kv.set("minimal", "", { createdBy: "", version: 0 });

      const result = await kv.get<string>("minimal");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("");
      }
    });
  });

  describe("prefix boundaries", () => {
    it("should handle prefix with trailing slash variations", async (ctx) => {
      const { blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix: "has-slash/",
        blobStore,
      });

      await kv.set("key", "value", { createdBy: "test", version: 1 });

      const result = await kv.get<string>("key");
      expect(result.exists).toBe(true);
    });

    it("should handle deeply nested prefix", async (ctx) => {
      const { blobStore } = ctx;
      const deepPrefix = "a/b/c/d/e/f/g/h/i/j/k/" as const;
      const kv = new KV2<TestMetadata>({
        prefix: deepPrefix,
        blobStore,
      });

      await kv.set("deep-key", "deep-value", { createdBy: "test", version: 1 });

      const result = await kv.get<string>("deep-key");
      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("deep-value");
      }
    });

    it("should handle keys that look like the prefix", async (ctx) => {
      const { blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix: "test-prefix/",
        blobStore,
      });

      // Key that repeats the prefix pattern
      await kv.set("test-prefix/nested", "value", {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<string>("test-prefix/nested");
      expect(result.exists).toBe(true);

      // List should show the full key
      const keys: string[] = [];
      for await (const key of kv.keys()) {
        keys.push(key);
      }
      expect(keys).toContain("test-prefix/nested");
    });
  });

  describe("concurrent threshold changes", () => {
    it("should handle reading values written with different thresholds", async (ctx) => {
      const { prefix, blobStore } = ctx;
      // Write with small threshold (forces large value mode)
      const kvSmall = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 10,
      });
      await kvSmall.set("cross-threshold", "this is a longer value", {
        createdBy: "small",
        version: 1,
      });

      // Read with large threshold
      const kvLarge = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 1000000,
      });
      const result = await kvLarge.get<string>("cross-threshold");

      expect(result.exists).toBe(true);
      if (result.exists) {
        expect(await result.value).toBe("this is a longer value");
      }
    });
  });

  describe("ArrayBuffer and typed array boundaries", () => {
    it("should handle ArrayBuffer values", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      // Create an ArrayBuffer and fill it with data
      const buffer = new ArrayBuffer(8);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < 8; i++) {
        view[i] = i * 10;
      }

      await kv.set("arraybuffer", buffer, { createdBy: "test", version: 1 });

      const result = await kv.get<Buffer>("arraybuffer");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(Buffer.isBuffer(value)).toBe(true);
        expect([...value]).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
      }
    });

    it("should handle empty ArrayBuffer", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({ prefix, blobStore });
      const buffer = new ArrayBuffer(0);

      await kv.set("empty-arraybuffer", buffer, {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<Buffer>("empty-arraybuffer");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.length).toBe(0);
      }
    });

    it("should handle large ArrayBuffer", async (ctx) => {
      const { prefix, blobStore } = ctx;
      const kv = new KV2<TestMetadata>({
        prefix,
        blobStore,
        largeValueThreshold: 100,
      });
      const buffer = new ArrayBuffer(1000);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < 1000; i++) {
        view[i] = i % 256;
      }

      await kv.set("large-arraybuffer", buffer, {
        createdBy: "test",
        version: 1,
      });

      const result = await kv.get<Buffer>("large-arraybuffer");
      expect(result.exists).toBe(true);
      if (result.exists) {
        const value = await result.value;
        expect(value.length).toBe(1000);
        for (let i = 0; i < 1000; i++) {
          expect(value[i]).toBe(i % 256);
        }
      }
    });
  });
});
