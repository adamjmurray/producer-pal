// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The body of a frozen .amxd: a small header, every file back to back, then a
// directory listing (`dlst`) of `dire` entries. Offsets are measured from the
// start of the body.

export interface FrozenEntry {
  /** Name in the listing, without a folder. */
  name: string;
  /** Four-character Max file type: `JSON`, `svg ` or `TEXT`. */
  type: string;
  data: Buffer;
  flag: number;
  /** Modified time, seconds since 1904-01-01 (the Mac epoch). */
  mdat: number;
}

const BODY_HEADER_BYTES = 16;

/**
 * Lay out files and their listing as a frozen device body.
 *
 * @param entries - The files in listing order; the first is the main patcher
 * @returns The frozen body
 */
export function buildFrozenBody(entries: FrozenEntry[]): Buffer {
  const offsets = entries.map((_, i) =>
    entries
      .slice(0, i)
      .reduce((at, e) => at + e.data.length, BODY_HEADER_BYTES),
  );
  const dlstOffset =
    BODY_HEADER_BYTES + entries.reduce((sum, e) => sum + e.data.length, 0);

  const header = Buffer.concat([
    Buffer.from("mx@c", "latin1"),
    u32(BODY_HEADER_BYTES),
    u32(0),
    u32(dlstOffset),
  ]);
  const directory = chunk(
    "dlst",
    Buffer.concat(
      entries.map((entry, i) =>
        chunk("dire", direFields(entry, offsets[i] ?? 0)),
      ),
    ),
  );

  return Buffer.concat([header, ...entries.map((e) => e.data), directory]);
}

// Encode one directory entry's fields.
function direFields(entry: FrozenEntry, offset: number): Buffer {
  return Buffer.concat([
    chunk("type", Buffer.from(entry.type, "latin1")),
    chunk("fnam", paddedName(entry.name)),
    chunk("sz32", u32(entry.data.length)),
    chunk("of32", u32(offset)),
    chunk("vers", u32(0)),
    chunk("flag", u32(entry.flag)),
    chunk("mdat", u32(entry.mdat)),
  ]);
}

// A name, null-terminated, then padded with nulls to a multiple of 4 bytes.
function paddedName(name: string): Buffer {
  const bytes = Buffer.from(`${name}\0`, "latin1");
  const padding = (4 - (bytes.length % 4)) % 4;

  return Buffer.concat([bytes, Buffer.alloc(padding)]);
}

// Frame a value as a 4-character tag and a big-endian length that includes the 8-byte frame.
function chunk(tag: string, value: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(tag, "latin1"),
    u32(value.length + 8),
    value,
  ]);
}

// Encode a big-endian unsigned 32-bit integer.
function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);

  buffer.writeUInt32BE(value);

  return buffer;
}
