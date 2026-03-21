import {
  createBlob,
  hasPayload,
  isPureJsonFormat,
  parseBlob,
  parseHeader,
} from "./blob-format.js";
import { describe, expect, it } from "./testing/vitest-compat.js";
import type { StoredEntry } from "./types.js";

interface TestMetadata {
  version: number;
}

describe("blob-format", () => {
  describe("isPureJsonFormat", () => {
    it("returns true for buffer starting with '{'", () => {
      const buffer = Buffer.from('{"test": true}');
      expect(isPureJsonFormat(buffer)).toBe(true);
    });

    it("returns false for buffer starting with length prefix", () => {
      const buffer = Buffer.alloc(10);
      buffer.writeUInt32BE(5, 0);
      expect(isPureJsonFormat(buffer)).toBe(false);
    });

    it("returns false for empty buffer", () => {
      expect(isPureJsonFormat(Buffer.alloc(0))).toBe(false);
    });
  });

  describe("createBlob + parseBlob roundtrip", () => {
    it("roundtrips small JSON value (pure JSON format)", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        value: { name: "Alice", age: 30 },
        encoding: "json",
      };

      const blob = createBlob(header);
      const parsed = parseBlob<TestMetadata>(blob);

      expect(parsed.header).toEqual(header);
      expect(parsed.payload).toBeNull();
      // Verify it's pure JSON (starts with '{')
      expect(blob[0]).toBe(0x7b);
    });

    it("roundtrips small base64 value (pure JSON format)", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 2 },
        value: "SGVsbG8gV29ybGQ=",
        encoding: "base64",
      };

      const blob = createBlob(header);
      const parsed = parseBlob<TestMetadata>(blob);

      expect(parsed.header).toEqual(header);
      expect(parsed.payload).toBeNull();
      expect(blob[0]).toBe(0x7b);
    });

    it("roundtrips large JSON value with payload (binary format)", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 3 },
        encoding: "raw-json",
      };
      const payload = Buffer.from('{"largeData":"..."}');

      const blob = createBlob(header, payload);
      const parsed = parseBlob<TestMetadata>(blob);

      expect(parsed.header).toEqual(header);
      expect(parsed.payload).toEqual(payload);
      // Verify it's binary format (does not start with '{')
      expect(blob[0]).not.toBe(0x7b);
    });

    it("roundtrips large binary value with payload (binary format)", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 4 },
        encoding: "raw-binary",
      };
      const payload = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

      const blob = createBlob(header, payload);
      const parsed = parseBlob<TestMetadata>(blob);

      expect(parsed.header).toEqual(header);
      expect(parsed.payload).toEqual(payload);
    });

    it("creates binary format for raw-json even without payload arg", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 5 },
        encoding: "raw-json",
      };

      const blob = createBlob(header);

      // Should be binary format because encoding indicates payload follows
      expect(blob[0]).not.toBe(0x7b);

      const parsed = parseBlob<TestMetadata>(blob);
      expect(parsed.header).toEqual(header);
      // Payload is empty but format supports it
      expect(parsed.payload?.length).toBe(0);
    });
  });

  describe("parseBlob error handling", () => {
    it("throws on empty buffer", () => {
      expect(() => parseBlob(Buffer.alloc(0))).toThrow(
        "Cannot parse empty buffer",
      );
    });

    it("throws on buffer too small for binary format", () => {
      const buffer = Buffer.from([0x00, 0x00]); // Only 2 bytes, need 4 for length
      expect(() => parseBlob(buffer)).toThrow("Buffer too small");
    });

    it("throws when header length exceeds buffer size", () => {
      const buffer = Buffer.alloc(8);
      buffer.writeUInt32BE(1000, 0); // Claims 1000 byte header but only 4 bytes follow
      expect(() => parseBlob(buffer)).toThrow("exceeds buffer size");
    });

    it("throws on invalid JSON in pure JSON format", () => {
      const buffer = Buffer.from("{invalid json}");
      expect(() => parseBlob(buffer)).toThrow();
    });

    it("throws on invalid JSON in binary format", () => {
      const buffer = Buffer.alloc(20);
      buffer.writeUInt32BE(10, 0);
      buffer.write("not json!", 4);
      expect(() => parseBlob(buffer)).toThrow();
    });
  });

  describe("parseHeader", () => {
    it("extracts header from pure JSON format", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        value: "test",
        encoding: "json",
      };
      const blob = createBlob(header);

      const parsed = parseHeader<TestMetadata>(blob);
      expect(parsed).toEqual(header);
    });

    it("extracts header from binary format", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 2 },
        encoding: "raw-binary",
      };
      const payload = Buffer.from("payload data");
      const blob = createBlob(header, payload);

      const parsed = parseHeader<TestMetadata>(blob);
      expect(parsed).toEqual(header);
    });
  });

  describe("hasPayload", () => {
    it("returns true for raw-json encoding", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        encoding: "raw-json",
      };
      expect(hasPayload(header)).toBe(true);
    });

    it("returns true for raw-binary encoding", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        encoding: "raw-binary",
      };
      expect(hasPayload(header)).toBe(true);
    });

    it("returns false for json encoding", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        value: {},
        encoding: "json",
      };
      expect(hasPayload(header)).toBe(false);
    });

    it("returns false for base64 encoding", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        value: "base64data",
        encoding: "base64",
      };
      expect(hasPayload(header)).toBe(false);
    });
  });

  describe("format safety", () => {
    it("pure JSON format is human-readable", () => {
      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 42 },
        value: { message: "Hello, World!" },
        encoding: "json",
      };

      const blob = createBlob(header);
      const text = blob.toString("utf-8");

      // Should be valid JSON
      expect(JSON.parse(text)).toEqual(header);
      // Should be human-readable
      expect(text).toContain('"message":"Hello, World!"');
    });

    it("binary format length prefix cannot conflict with pure JSON", () => {
      // For a conflict, the first byte of uint32 BE would need to be 0x7B (123)
      // This requires header length >= 0x7B000000 (~2GB), which is impossible

      const header: StoredEntry<TestMetadata> = {
        metadata: { version: 1 },
        encoding: "raw-binary",
      };
      const payload = Buffer.alloc(100);

      const blob = createBlob(header, payload);

      // First byte should be 0x00 (small header)
      expect(blob[0]).toBe(0x00);
      // Should not be confused with pure JSON
      expect(isPureJsonFormat(blob)).toBe(false);
    });
  });
});
