import type { StoredEntry } from "./types.js";
export declare const MAX_HEADER_SIZE: number;
export interface ParsedBlob<M> {
    header: StoredEntry<M>;
    payload: Buffer | null;
}
/**
 * Detects whether a blob uses pure JSON format or binary format.
 * Pure JSON starts with '{' (0x7B), binary format starts with uint32 length.
 */
export declare function isPureJsonFormat(buffer: Buffer): boolean;
/**
 * Parses a blob buffer into header and optional payload.
 * Automatically detects format based on first byte.
 *
 * @throws {SyntaxError} If JSON parsing fails
 * @throws {RangeError} If header length exceeds buffer size
 */
export declare function parseBlob<M>(buffer: Buffer): ParsedBlob<M>;
/**
 * Creates a blob buffer from header and optional payload.
 * Uses pure JSON format when no payload, binary format otherwise.
 *
 * @throws {Error} If header exceeds MAX_HEADER_SIZE in binary format
 */
export declare function createBlob<M>(header: StoredEntry<M>, payload?: Buffer): Buffer;
/**
 * Extracts just the header from a blob without fully parsing the payload.
 * Useful for metadata-only reads.
 */
export declare function parseHeader<M>(buffer: Buffer): StoredEntry<M>;
/**
 * Checks if a blob has a payload (large value stored after header).
 */
export declare function hasPayload<M>(header: StoredEntry<M>): boolean;
//# sourceMappingURL=blob-format.d.ts.map