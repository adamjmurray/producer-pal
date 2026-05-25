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
  /** Make each lane's create_*_clip return a non-existent ref (id 0) */
  clipCreationFails?: boolean;
  /**
   * Seed clips into pre-existing lanes for overlap testing. Index i lists the
   * clip time ranges (in beats) to register on initial lane i.
   */
  initialLaneClips?: Array<Array<{ start: number; end: number }>>;
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
  const {
    trackIndex = 0,
    initialLanes = 0,
    clipLength = 4,
    clipCreationFails = false,
    initialLaneClips = [],
  } = options;
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

    seedLaneClips(
      laneProps,
      laneClips,
      trackIndex,
      laneIndex,
      initialLaneClips,
    );

    const createClip = (kind: string, startBeats: unknown): unknown[] => {
      // Simulate Live failing to create the clip (returns the "no object" ref).
      if (clipCreationFails) {
        return ["id", "0"];
      }

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

/**
 * Seed pre-existing clips into a lane's arrangement_clips for overlap testing.
 * No-op when the lane index has no seed entry (e.g. lanes created at runtime).
 * @param laneProps - The lane's mutable props object
 * @param laneClips - The lane's clip-id list (mutated in place)
 * @param trackIndex - Owning track index
 * @param laneIndex - 0-based lane index
 * @param initialLaneClips - Per-lane seed clip ranges
 */
function seedLaneClips(
  laneProps: Record<string, unknown>,
  laneClips: string[],
  trackIndex: number,
  laneIndex: number,
  initialLaneClips: Array<Array<{ start: number; end: number }>>,
): void {
  const seeds = initialLaneClips[laneIndex];

  if (seeds == null || seeds.length === 0) return;

  for (const { start, end } of seeds) {
    const clipId = `tl_seed_clip_${uid++}`;

    registerMockObject(clipId, {
      path: String(
        livePath
          .track(trackIndex)
          .takeLane(laneIndex)
          .arrangementClip(laneClips.length),
      ),
      type: "Clip",
      properties: { is_arrangement_clip: 1, start_time: start, end_time: end },
    });
    laneClips.push(clipId);
  }

  laneProps.arrangement_clips = children(...laneClips);
}
