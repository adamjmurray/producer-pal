// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { numberToPitchClass } from "#src/shared/pitch.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { type ParsedScale } from "./scale-parsing.ts";

/**
 * Apply a scale to the live set or a clip, or disable it. Reported only when
 * Live stores a different spelling than the one asked for.
 * @param target - The live_set or MIDI clip object
 * @param parsed - The scale, already read by parseScale, or null to disable it
 * @param requested - The scale as the caller wrote it
 * @param result - Result object to update
 * @param result.scale - The scale Live stores, when it isn't the one asked for
 * @param result.detail - Why the spelling isn't the one asked for
 * @param landed - Called once the first write has gone through, so a later
 *   write that throws can still say the scale changed
 */
export function applyScale(
  target: LiveAPI,
  parsed: ParsedScale | null,
  requested: string,
  result: { scale?: string; detail?: string },
  landed?: () => void,
): void {
  if (parsed == null) {
    target.set("scale_mode", 0);
    landed?.();

    return;
  }

  const { scaleRoot, scaleName, scaleRootNumber } = parsed;

  target.set("root_note", scaleRootNumber);
  landed?.();
  target.set("scale_name", scaleName);
  target.set("scale_mode", 1);

  // Live keeps only a pitch class number, so every read of the root comes back
  // flat ("F#" -> "Gb"). Report what it stores, or a later read disagrees.
  const storedRoot =
    numberToPitchClass(target.getProperty("root_note") as number) ?? scaleRoot;
  const stored = `${storedRoot} ${String(target.getProperty("scale_name"))}`;

  if (stored === requested.trim()) {
    return;
  }

  result.scale = stored;
  // Without the detail, a model that asked for F# sees Gb come back and
  // retries, thinking the write failed.
  appendDetail(
    result,
    storedRoot === scaleRoot
      ? `scale ${requested.trim()} is spelled ${stored} — same scale, set correctly`
      : `scale roots are spelled with flats, so ${scaleRoot} comes back as ${storedRoot} — same scale, set correctly`,
  );
}
