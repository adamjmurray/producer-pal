// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";
import { CLIP_SCALE_MIN_VERSION } from "./call-scale.ts";
import { readScaleState, type ScaleState } from "./scale-reading.ts";

/**
 * Read a MIDI clip's own scale, so a re-created copy can be given the same.
 * @param sourceClip - The MIDI clip being copied
 * @returns The scale (on or off), or null where Live gives clips none
 */
export function readClipScaleToCopy(sourceClip: LiveAPI): ScaleState | null {
  return liveVersionAtLeast(CLIP_SCALE_MIN_VERSION, { release: true })
    ? readScaleState(sourceClip)
    : null;
}

/**
 * Give a re-created clip the source's scale. A new clip starts with the Live
 * Set's scale, so this is written even when the source's is off. A failed write
 * leaves a clip that exists, so it is reported in `losses`, not thrown.
 * @param newClip - The clip just created
 * @param scale - The source's scale from {@link readClipScaleToCopy}, or null
 * @param losses - What the re-create lost, added to
 */
export function copyClipScale(
  newClip: LiveAPI,
  scale: ScaleState | null,
  losses: string[],
): void {
  if (scale == null) {
    return;
  }

  try {
    // The mode goes last: root and name are kept while the scale is off.
    newClip.set("root_note", scale.rootNote);
    newClip.set("scale_name", scale.name);
    newClip.set("scale_mode", scale.enabled ? 1 : 0);
  } catch {
    losses.push("scale isn't copied");
  }
}
