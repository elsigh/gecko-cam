const HEADER_LENGTH_BYTES = 4;
// Max header size ensures uint32 BE first byte < 0x7B ('{'), preventing format ambiguity
// 0x7B000000 = 2,063,597,568 bytes; we use 100MB as a practical limit
export const MAX_HEADER_SIZE = 100 * 1024 * 1024;
// ASCII code for '{'
const OPEN_BRACE = 0x7b;
/**
 * Detects whether a blob uses pure JSON format or binary format.
 * Pure JSON starts with '{' (0x7B), binary format starts with uint32 length.
 */
export function isPureJsonFormat(buffer) {
    return buffer.length > 0 && buffer[0] === OPEN_BRACE;
}
/**
 * Parses a blob buffer into header and optional payload.
 * Automatically detects format based on first byte.
 *
 * @throws {SyntaxError} If JSON parsing fails
 * @throws {RangeError} If header length exceeds buffer size
 */
export function parseBlob(buffer) {
    if (buffer.length === 0) {
        throw new Error("Cannot parse empty buffer");
    }
    if (isPureJsonFormat(buffer)) {
        // Pure JSON format: entire buffer is the header
        const header = JSON.parse(buffer.toString("utf-8"));
        return { header, payload: null };
    }
    // Binary format: length-prefixed header + optional payload
    if (buffer.length < HEADER_LENGTH_BYTES) {
        throw new Error(`Buffer too small for binary format: ${buffer.length} bytes`);
    }
    const headerLength = buffer.readUInt32BE(0);
    const headerEnd = HEADER_LENGTH_BYTES + headerLength;
    if (headerEnd > buffer.length) {
        throw new RangeError(`Header length ${headerLength} exceeds buffer size ${buffer.length}`);
    }
    // Parse header JSON
    const headerJson = buffer
        .subarray(HEADER_LENGTH_BYTES, headerEnd)
        .toString("utf-8");
    const header = JSON.parse(headerJson);
    // Extract payload if present (for "raw-*" encodings)
    const hasPayload = header.encoding === "raw-json" || header.encoding === "raw-binary";
    const payload = hasPayload ? buffer.subarray(headerEnd) : null;
    return { header, payload };
}
/**
 * Creates a blob buffer from header and optional payload.
 * Uses pure JSON format when no payload, binary format otherwise.
 *
 * @throws {Error} If header exceeds MAX_HEADER_SIZE in binary format
 */
export function createBlob(header, payload) {
    const headerJson = JSON.stringify(header);
    const headerBuffer = Buffer.from(headerJson, "utf-8");
    // Use binary format if payload exists OR if encoding indicates payload follows
    const hasPayload = payload ||
        header.encoding === "raw-json" ||
        header.encoding === "raw-binary";
    if (hasPayload) {
        // Safety: header size must be < MAX_HEADER_SIZE to ensure first byte < 0x7B
        /* c8 ignore next 4 -- requires 100MB+ header which is impractical to test */
        if (headerBuffer.length >= MAX_HEADER_SIZE) {
            throw new Error(`Header too large: ${headerBuffer.length} bytes (max ${MAX_HEADER_SIZE})`);
        }
        // Binary format: length-prefixed header + payload
        const lengthBuffer = Buffer.alloc(HEADER_LENGTH_BYTES);
        lengthBuffer.writeUInt32BE(headerBuffer.length, 0);
        if (payload) {
            return Buffer.concat([lengthBuffer, headerBuffer, payload]);
        }
        return Buffer.concat([lengthBuffer, headerBuffer]);
    }
    // Pure JSON format: just the header (no length prefix)
    return headerBuffer;
}
/**
 * Extracts just the header from a blob without fully parsing the payload.
 * Useful for metadata-only reads.
 */
export function parseHeader(buffer) {
    return parseBlob(buffer).header;
}
/**
 * Checks if a blob has a payload (large value stored after header).
 */
export function hasPayload(header) {
    return header.encoding === "raw-json" || header.encoding === "raw-binary";
}
//# sourceMappingURL=blob-format.js.map