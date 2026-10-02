// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** One clip in a row, and where the call sends it. */
export interface RowClip {
  id: string;
  /** Start in beats */
  start: number;
  /** End in beats */
  end: number;
}

/** Beats per bar, in the 4/4 these mocks are registered as. */
export const BAR = 4;

/**
 * Register an arrangement MIDI clip at a Live path.
 * @param clipId - Clip id
 * @param path - Where the clip sits
 * @param start - Start in beats
 * @param end - End in beats
 * @returns The registered mock
 */
export function registerClipAt(
  clipId: string,
  path: PathLike,
  start: number,
  end: number,
): RegisteredMockObject {
  return registerMockObject(clipId, {
    path,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: start,
      end_time: end,
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
}

/**
 * Register a row of clips on a track's main arrangement lane.
 * @param row - The clips, in call order
 * @param trackIndex - The track they sit on
 * @returns The clips as the update loop sees them
 */
export function registerRow(row: RowClip[], trackIndex = 0): LiveAPI[] {
  return registerRowAt(row, (index) =>
    livePath.track(trackIndex).arrangementClip(index),
  );
}

/**
 * Register a row of clips on one of a track's take lanes.
 * @param row - The clips, in call order
 * @param laneIndex - The take lane they sit on
 * @param trackIndex - The track holding the lane
 * @returns The clips as the update loop sees them
 */
export function registerLaneRow(
  row: RowClip[],
  laneIndex = 0,
  trackIndex = 0,
): LiveAPI[] {
  return registerRowAt(row, (index) =>
    livePath.track(trackIndex).takeLane(laneIndex).arrangementClip(index),
  );
}

/**
 * Register a row of clips and hand back their LiveAPI handles.
 * @param row - The clips, in call order
 * @param pathFor - The path for each clip's place in the lane
 * @returns The clips as the update loop sees them
 */
function registerRowAt(
  row: RowClip[],
  pathFor: (index: number) => PathLike,
): LiveAPI[] {
  return row.map((clip, index) => {
    registerClipAt(clip.id, pathFor(index), clip.start, clip.end);

    return LiveAPI.from(`id ${clip.id}`);
  });
}
