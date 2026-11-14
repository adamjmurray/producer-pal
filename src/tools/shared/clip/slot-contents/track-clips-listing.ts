// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The clips a track holds, as a path and a name each: a light read for a caller
// that only has to say what is there. Reads `has_clip` and `start_time`, and
// leaves `name` to the caller, which reads it for the clips it prints.

import { returnClipsExist } from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  arrangementPositionPath,
  returnSlotPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";

/** One clip on a track: where it sits, and the clip itself. */
export interface ListedClip {
  /** `t0/s1`, `rt0/s1`, or `t0[5|1]` / `t0/l1[5|1]` in the arrangement */
  path: string;
  /** Not read from beyond what is shown: a caller reads `name` only for the
   * clips it prints. Only good for the request that listed it. */
  clip: LiveAPI;
}

/**
 * Every clip a regular or return track holds: session clips by scene, then
 * arrangement clips by start time, then take-lane clips by lane and start
 * time. A return track has no arrangement, and on Live 12 no session clips.
 * @param track - A regular or return track
 * @returns The clips; empty for any other track
 */
export function listTrackClips(track: LiveAPI): ListedClip[] {
  if (track.category === "return") {
    return returnClipsExist()
      ? sessionClips(track, (scene) =>
          returnSlotPath(track.returnTrackIndex as number, scene),
        )
      : [];
  }

  if (track.category !== "regular") {
    return [];
  }

  const trackIndex = track.trackIndex as number;
  const lanes: Array<{ owner: LiveAPI; lane: ArrangementLane }> = [
    { owner: track, lane: { kind: "track", trackIndex } },
    ...track.getChildren("take_lanes").map((owner, laneIndex) => ({
      owner,
      lane: { kind: "take-lane", trackIndex, laneIndex } as const,
    })),
  ];

  const timed = lanes.flatMap(({ owner, lane }) => clipsByStart(owner, lane));
  // Read once for the track, and only when it has an arrangement clip: the
  // request memo doesn't hold while requests overlap, so a per-clip read can
  // really happen.
  const meter = timed.length > 0 ? songMeter() : undefined;

  return [
    ...sessionClips(track, (scene) => slotPath(trackIndex, scene)),
    ...timed.map(({ lane, clip, start }) => ({
      path: arrangementPositionPath(lane, start, meter),
      clip,
    })),
  ];
}

// --- Helpers below main export ---

// The track's clip slots in scene order; only a slot that holds a clip has its
// clip built.
function sessionClips(
  track: LiveAPI,
  pathOf: (scene: number) => string,
): ListedClip[] {
  return track.getChildren("clip_slots").flatMap((slot, scene) => {
    if (!slot.getProperty("has_clip")) {
      return [];
    }

    const clip = slot.child("clip");

    return clip.exists() ? [{ path: pathOf(scene), clip }] : [];
  });
}

// The clips on a track's main lane or on one take lane, by start time.
function clipsByStart(
  owner: LiveAPI,
  lane: ArrangementLane,
): Array<{ lane: ArrangementLane; clip: LiveAPI; start: number }> {
  return owner
    .getChildren("arrangement_clips")
    .filter((clip) => clip.exists())
    .map((clip) => ({
      lane,
      clip,
      start: clip.getProperty("start_time") as number,
    }))
    .toSorted((a, b) => a.start - b.start);
}
