// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noteNameToMidi } from "#src/shared/pitch.ts";
import { parseTimeSignature } from "#src/tools/shared/utils.ts";
import { refuseDoubledPosition } from "#src/tools/shared/validation/helpers/clip-destination-path.ts";

/**
 * Refuses a call there is no reading of, before any clip is touched: a
 * whole-call param with no valid value, or one position spelled two ways.
 * @param timeSignature - Whole-call meter, if sent
 * @param quantizePitch - Whole-call quantize pitch, if sent
 * @param toPath - Destination path(s), if sent
 * @param arrangementStart - Deprecated destination position(s), if sent
 */
export function refuseUnreadableCall(
  timeSignature: string | undefined,
  quantizePitch: string | undefined,
  toPath: string | undefined,
  arrangementStart: string | undefined,
): void {
  validateWholeCallParams(timeSignature, quantizePitch);
  refuseDoubledPosition(toPath, arrangementStart, "toPath");
}

/**
 * Refuse start/length next to duplicateLoop. They set the loop region, which is
 * exactly what duplicate_loop copies, so the call reads two ways - "the region
 * to double" or "the length to end up at" - and both look like success, since
 * the note count doubles either way. Two calls say which (ADR-0040). firstStart
 * still composes: it moves the playback marker, not the region.
 * @param start - Loop region start, if sent
 * @param length - Loop region length, if sent
 * @param duplicateLoop - Whether to double the loop
 */
export function refuseRegionWithDuplicateLoop(
  start: string | undefined,
  length: string | undefined,
  duplicateLoop: boolean | undefined,
): void {
  if (!duplicateLoop) return;

  const sent = [
    start != null ? "start" : null,
    length != null ? "length" : null,
  ].filter((param) => param != null);

  if (sent.length === 0) return;

  const named = sent.join("/");
  const verb = sent.length > 1 ? "set" : "sets";

  // The whole-clip double is the common case, so it goes first: a model told
  // "send two calls" first reads that as the instruction and sets the region
  // it never wanted, landing on twice the length all over again.
  throw new Error(
    `duplicateLoop cannot be combined with ${sent.join(" or ")}: ${named} ` +
      `${verb} the loop region, which is exactly what duplicateLoop doubles. ` +
      `To double the whole clip, send duplicateLoop on its own. To double just ` +
      `part of it, send ${named} in a separate call first.`,
  );
}

/**
 * Refuse a whole-call param the tool can't read, before any clip is touched.
 *
 * These are one value for every clip in the call, so a per-clip skip would
 * repeat the same message down the list - and the per-clip warn-and-skip
 * wrapper would swallow a throw from inside the loop.
 * @param timeSignature - Time signature to apply, if given
 * @param quantizePitch - Pitch to limit quantization to, if given
 */
function validateWholeCallParams(
  timeSignature: string | undefined,
  quantizePitch: string | undefined,
): void {
  if (timeSignature != null) parseTimeSignature(timeSignature);

  if (quantizePitch != null && noteNameToMidi(quantizePitch) == null) {
    throw new Error(`invalid note name "${quantizePitch}" for quantizePitch`);
  }
}
