// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The .amxd wrapper: a 32-byte header, then the patcher body. Max writes meta
// 1 for a device you edit and meta 7 for a frozen one.

export const AMXD_META_UNFROZEN = 1;
export const AMXD_META_FROZEN = 7;

const HEADER_BYTES = 32;
const META_OFFSET = 20;
const LENGTH_OFFSET = 28;

/**
 * Split an .amxd into its meta value and body.
 *
 * @param bytes - The whole file
 * @returns The meta value and the body after the header
 */
export function parseAmxd(bytes: Buffer): { meta: number; body: Buffer } {
  const expected = buildAmxd(0, Buffer.alloc(0)).subarray(0, HEADER_BYTES);

  if (
    bytes.length < HEADER_BYTES ||
    !bytes.subarray(0, META_OFFSET).equals(expected.subarray(0, META_OFFSET)) ||
    !bytes
      .subarray(META_OFFSET + 4, LENGTH_OFFSET)
      .equals(expected.subarray(META_OFFSET + 4, LENGTH_OFFSET))
  ) {
    throw new Error("Not a Max for Live device (.amxd) file.");
  }

  const body = bytes.subarray(HEADER_BYTES);

  if (bytes.readUInt32LE(LENGTH_OFFSET) !== body.length) {
    throw new Error("The .amxd file is truncated or has trailing bytes.");
  }

  return { meta: bytes.readUInt32LE(META_OFFSET), body };
}

/**
 * Wrap a body in the .amxd header.
 *
 * @param meta - The meta value (1 unfrozen, 7 frozen)
 * @param body - The patcher body
 * @returns The whole file
 */
export function buildAmxd(meta: number, body: Buffer): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);

  header.write("ampf", 0, "latin1");
  header.writeUInt32LE(4, 4);
  header.write("mmmmmeta", 8, "latin1");
  header.writeUInt32LE(4, 16);
  header.writeUInt32LE(meta, META_OFFSET);
  header.write("ptch", 24, "latin1");
  header.writeUInt32LE(body.length, LENGTH_OFFSET);

  return Buffer.concat([header, body]);
}
