// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The ids Max's `vst~` may know a VST3 plug-in by, for picking it out of a file
 * that holds several when loading by path. The id is a hash of the plug-in's
 * 16-byte class id, each byte taken as signed. Windows hashes them in COM order
 * (the first three fields byte-swapped) and macOS as written, so both ids are
 * given. A wrong id loads nothing, so trying both is safe.
 *
 * @param devIdentifier - Live's `device:vst3:<kind>:<class id>` for the plug-in
 * @returns The candidate ids, likeliest first; none when there is no class id
 */
export function vst3PluginIds(devIdentifier: string | null): number[] {
  const hex = (devIdentifier?.split(":").pop() ?? "").replaceAll("-", "");

  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    return [];
  }

  const plain = [...Buffer.from(hex, "hex")];
  const com = [3, 2, 1, 0, 5, 4, 7, 6].map((index) => plain[index] as number);

  return [
    ...new Set([hashBytes([...com, ...plain.slice(8)]), hashBytes(plain)]),
  ];
}

/**
 * JUCE's hash of a byte range, as a signed 32-bit int.
 *
 * @param bytes - The bytes
 * @returns The hash
 */
function hashBytes(bytes: number[]): number {
  let hash = 0;

  for (const byte of bytes) {
    // A signed byte, as Max hashes it: 0x80 and up count as negative.
    hash = Math.imul(hash, 31) + ((byte << 24) >> 24);
  }

  // Math.imul wraps each step; this wraps the last add.
  return Math.imul(hash, 1);
}
