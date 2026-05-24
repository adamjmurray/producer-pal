// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

let uid = 0;

export interface TakeLaneTrackOptions {
  trackIndex?: number;
  /** Number of pre-existing (empty) take lanes */
  initialLanes?: number;
  /** Length in beats for clips created on lanes */
  clipLength?: number;
}

/**
 * Register a regular track with stateful take-lane support. `create_take_lane`
 * appends a lane and grows the track's `take_lanes` list; each lane's
 * `create_midi_clip` / `create_audio_clip` registers and returns a fresh
 * arrangement clip and grows the lane's `arrangement_clips` list.
 * @param options - Track index, initial lane count, and clip length
 * @returns The registered track mock object
 */
export function registerTakeLaneTrack(
  options: TakeLaneTrackOptions = {},
): RegisteredMockObject {
  const { trackIndex = 0, initialLanes = 0, clipLength = 4 } = options;
  const laneIds: string[] = [];

  // Mutating the props objects is reflected by the registry's get() (read live),
  // so create_take_lane / create_*_clip grow the child lists statefully.
  const registerLane = (laneIndex: number): string => {
    const laneId = `tl_lane_${uid++}`;
    const laneClips: string[] = [];
    const laneProps: Record<string, unknown> = {
      name: "Lane",
      arrangement_clips: children(),
    };

    const createClip = (kind: string, startBeats: unknown): unknown[] => {
      const clipId = `tl_clip_${uid++}`;
      const start = typeof startBeats === "number" ? startBeats : 0;

      registerMockObject(clipId, {
        path: String(
          livePath
            .track(trackIndex)
            .takeLane(laneIndex)
            .arrangementClip(laneClips.length),
        ),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          [kind]: 1,
          length: clipLength,
          start_time: start,
          end_time: start + clipLength,
        },
      });
      laneClips.push(clipId);
      laneProps.arrangement_clips = children(...laneClips);

      return ["id", clipId];
    };

    registerMockObject(laneId, {
      path: String(livePath.track(trackIndex).takeLane(laneIndex)),
      type: "TakeLane",
      properties: laneProps,
      methods: {
        create_midi_clip: (_start) => createClip("is_midi_clip", _start),
        create_audio_clip: (_file, _start) =>
          createClip("is_audio_clip", _start),
      },
    });

    return laneId;
  };

  for (let i = 0; i < initialLanes; i++) {
    laneIds.push(registerLane(i));
  }

  const trackProps: Record<string, unknown> = {
    has_midi_input: 1,
    is_foldable: 0,
    take_lanes: children(...laneIds),
  };

  return registerMockObject(`tl_track_${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: trackProps,
    methods: {
      create_take_lane: () => {
        const laneId = registerLane(laneIds.length);

        laneIds.push(laneId);
        trackProps.take_lanes = children(...laneIds);

        return ["id", laneId];
      },
    },
  });
}

/**
 * Register a take lane (under a track) holding clips at given time ranges, for
 * overlap testing. The track itself is not registered here.
 * @param trackIndex - Owning track index
 * @param laneIndex - 0-based lane index
 * @param clips - Clip time ranges in beats
 * @returns The registered take lane mock object
 */
export function registerTakeLaneWithClips(
  trackIndex: number,
  laneIndex: number,
  clips: Array<{ start: number; end: number }>,
): RegisteredMockObject {
  const clipIds = clips.map((clip, i) => {
    const clipId = `tl_existing_clip_${uid++}`;

    registerMockObject(clipId, {
      path: String(
        livePath.track(trackIndex).takeLane(laneIndex).arrangementClip(i),
      ),
      type: "Clip",
      properties: { start_time: clip.start, end_time: clip.end },
    });

    return clipId;
  });

  return registerMockObject(`tl_lane_existing_${uid++}`, {
    path: String(livePath.track(trackIndex).takeLane(laneIndex)),
    type: "TakeLane",
    properties: { name: "Lane", arrangement_clips: children(...clipIds) },
  });
}
