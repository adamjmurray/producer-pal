// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";

/**
 * Read and decompress a gzip-compressed .als file to a UTF-8 XML string.
 * @param filePath - Path to the .als file
 * @returns Decompressed XML string
 */
export function readAls(filePath: string): string {
  const compressed = fs.readFileSync(filePath);

  return zlib.gunzipSync(compressed).toString("utf8");
}

/**
 * Gzip-compress an XML string and atomically write it to disk as a .als file.
 * Uses a temp file + rename so a crash mid-write never leaves a corrupt file.
 * @param filePath - Destination path for the .als file
 * @param xml - XML string to compress and write
 */
export function writeAls(filePath: string, xml: string): void {
  const tmp = `${filePath}.tmp-${process.pid}`;

  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(xml, "utf8")));
  fs.renameSync(tmp, filePath);
}

/**
 * Copy a .als file to a .bak backup (overwrites any existing backup).
 * @param filePath - Path to the .als file to back up
 * @returns Path of the created .bak file
 */
export function backupAls(filePath: string): string {
  const bakPath = `${filePath}.bak`;

  fs.copyFileSync(filePath, bakPath);

  return bakPath;
}

/**
 * Check whether Ableton Live (or Producer Pal) has a set open by testing
 * whether TCP port 3350 is in LISTEN state locally.
 *
 * Fail-open: if `lsof` is unavailable the catch returns false (treats set as
 * not open). The `.bak` backup written before every write is the real safety net.
 *
 * @returns True if port 3350 is listening, false otherwise
 */
export function isSetLikelyOpen(): boolean {
  try {
    const out = execSync("lsof -nP -iTCP:3350 -sTCP:LISTEN -t", { encoding: "utf8" });

    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Assert that `after` differs from `before` only inside the named clip's block.
 * Uses `locateClipBlock` (the same locator as `injectClipEnvelope`) for exact,
 * byte-level comparison of everything outside the target clip.
 * Throws if any byte outside the clip changed, naming which region (prefix/suffix).
 * @param before - Original XML string before the write operation
 * @param after - Modified XML string after the write operation
 * @param clipName - Name of the clip whose envelopes were changed
 */
export function assertOnlyEnvelopeChanged(before: string, after: string, clipName: string): void {
  const b = locateClipBlock(before, clipName);
  const a = locateClipBlock(after, clipName);

  if (before.slice(0, b.start) !== after.slice(0, a.start)) {
    throw new Error("Unerwartete Aenderung ausserhalb des Ziel-Clips: prefix weicht ab");
  }

  if (before.slice(b.end) !== after.slice(a.end)) {
    throw new Error("Unerwartete Aenderung ausserhalb des Ziel-Clips: suffix weicht ab");
  }
}
