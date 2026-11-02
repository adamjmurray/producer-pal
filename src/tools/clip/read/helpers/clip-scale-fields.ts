// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type CallScale } from "#src/tools/shared/schema/scale/call-scale.ts";
import {
  formatScale,
  readScalePitches,
  readScaleState,
} from "#src/tools/shared/schema/scale/scale-reading.ts";

/** The scale fields of a clip read. */
export interface ClipScaleFields {
  scale?: string;
  scalePitches?: string;
}

/**
 * Add a MIDI clip's scale to its read, only when it differs from the Live Set's
 * (a scale on or off the same way, with the same root and name, says nothing).
 * A clip with its scale off while the Live Set's is on reads `scale: ""`.
 * Nothing is added where Live gives clips no scale.
 * @param result - The clip's read, added to
 * @param clip - The MIDI clip
 * @param callScale - What the call asked Live about scales
 */
export function addClipScale(
  result: ClipScaleFields,
  clip: LiveAPI,
  callScale: CallScale,
): void {
  if (!callScale.supported()) {
    return;
  }

  const song = callScale.song();
  const own = readScaleState(clip);

  if (!own.enabled) {
    if (song.enabled) {
      result.scale = "";
    }

    return;
  }

  if (
    song.enabled &&
    song.rootNote === own.rootNote &&
    song.name === own.name
  ) {
    return;
  }

  result.scale = formatScale(own);
  result.scalePitches = readScalePitches(clip, own.rootNote);
}
