// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as zlib from "node:zlib";

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
 * Gzip-compress an XML string and write it to disk as a .als file.
 * @param filePath - Destination path for the .als file
 * @param xml - XML string to compress and write
 */
export function writeAls(filePath: string, xml: string): void {
  const compressed = zlib.gzipSync(Buffer.from(xml, "utf8"));

  fs.writeFileSync(filePath, compressed);
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
 * Extract the Envelopes block from the named MidiClip within an XML string.
 * Returns the XML with the clip's Envelopes section replaced by a placeholder.
 * @param xml - Full .als XML string
 * @param clipName - Name of the target clip
 * @returns XML with envelopes replaced by placeholder, or original if clip not found
 */
function redactClipEnvelopes(xml: string, clipName: string): string {
  const midiClipRe = /<MidiClip\b(?:(?!<\/MidiClip>).)*?<\/MidiClip>/gs;
  const namePattern = `<Name Value="${clipName}" />`;

  let m: RegExpExecArray | null;

  while ((m = midiClipRe.exec(xml)) !== null) {
    if (!m[0].includes(namePattern)) continue;

    const clipBlock = m[0];
    const envMatch = /<Envelopes>[\S\s]*?<\/Envelopes>/.exec(clipBlock);

    if (envMatch == null) return xml;

    const redactedClip =
      clipBlock.slice(0, envMatch.index) +
      "__ENV__" +
      clipBlock.slice(envMatch.index + envMatch[0].length);

    return xml.slice(0, m.index) + redactedClip + xml.slice(m.index + clipBlock.length);
  }

  return xml;
}

/**
 * Assert that `after` differs from `before` only inside the named clip's Envelopes block.
 * Throws if any content outside the target clip's envelopes changed.
 * @param before - Original XML string before the write operation
 * @param after - Modified XML string after the write operation
 * @param clipName - Name of the clip whose envelopes were changed
 */
export function assertOnlyEnvelopeChanged(before: string, after: string, clipName: string): void {
  const redactedBefore = redactClipEnvelopes(before, clipName);
  const redactedAfter = redactClipEnvelopes(after, clipName);

  if (redactedBefore !== redactedAfter) {
    throw new Error("Unerwartete Aenderung ausserhalb des Ziel-Clip-Envelopes");
  }
}
