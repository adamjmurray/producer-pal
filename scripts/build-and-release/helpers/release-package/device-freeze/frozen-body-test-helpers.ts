// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Read a frozen body's directory back into its entries' fields.
 * @param body - The frozen body
 * @returns Each entry's fields, by four-letter tag
 */
export function readFrozenDirectory(body: Buffer): Record<string, Buffer>[] {
  const start = body.readUInt32BE(12);
  const end = start + body.readUInt32BE(start + 4);
  const entries: Record<string, Buffer>[] = [];

  for (let at = start + 8; at < end; at += body.readUInt32BE(at + 4)) {
    const fields: Record<string, Buffer> = {};
    const entryEnd = at + body.readUInt32BE(at + 4);

    for (let f = at + 8; f < entryEnd; f += body.readUInt32BE(f + 4)) {
      fields[body.toString("latin1", f, f + 4)] = body.subarray(
        f + 8,
        f + body.readUInt32BE(f + 4),
      );
    }

    entries.push(fields);
  }

  return entries;
}
