// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { audioClipSampleSeconds } from "./audio-clip-timing.ts";

interface RawWarpMarker {
  sample_time: number;
  beat_time: number;
}

/**
 * Where a warped audio clip's file ends, in the clip's own beats.
 *
 * The clip's warp markers decide this, so it can't be measured on another clip
 * of the same file: that one has the file's saved warp, not this clip's.
 * @param clip - The warped audio clip
 * @returns The beat the file ends on, or null when the markers or the file's
 *   length can't be read
 */
export function warpedFileEndBeats(clip: LiveAPI): number | null {
  const fileSeconds = audioClipSampleSeconds(clip);
  const markers = readMarkers(clip);

  if (!(fileSeconds > 0) || markers.length < 2) {
    return null;
  }

  // The stretch between the two markers around the file end; past the last
  // marker, the last stretch carries on.
  let after = markers.findIndex((marker) => marker.sample_time >= fileSeconds);

  if (after < 1) {
    after = after === 0 ? 1 : markers.length - 1;
  }

  const from = markers[after - 1] as RawWarpMarker;
  const to = markers[after] as RawWarpMarker;
  const seconds = to.sample_time - from.sample_time;

  if (!(seconds > 0)) {
    return null;
  }

  const beatsPerSecond = (to.beat_time - from.beat_time) / seconds;

  return from.beat_time + (fileSeconds - from.sample_time) * beatsPerSecond;
}

/**
 * Read a clip's warp markers as Live gives them.
 * @param clip - The audio clip
 * @returns The markers in file order, or none when they can't be read
 */
function readMarkers(clip: LiveAPI): RawWarpMarker[] {
  try {
    const parsed: unknown = JSON.parse(
      clip.getProperty("warp_markers") as string,
    );
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { warp_markers?: unknown } | null)?.warp_markers;

    return Array.isArray(list) ? (list as RawWarpMarker[]) : [];
  } catch {
    return [];
  }
}
