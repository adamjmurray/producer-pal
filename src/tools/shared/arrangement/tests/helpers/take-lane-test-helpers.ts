// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

let uid = 0;

/**
 * Assert a take lane was told to create a MIDI clip at the given position.
 * @param laneIndex - Take lane index
 * @param start - Expected clip start, in beats
 * @param length - Expected clip length, in beats
 * @param trackIndex - Track holding the lane
 */
export function expectTakeLaneMidiClip(
  laneIndex: number,
  start: number,
  length = 4,
  trackIndex = 0,
): void {
  expect(
    lookupMockObject(undefined, livePath.track(trackIndex).takeLane(laneIndex))
      ?.call,
  ).toHaveBeenCalledWith("create_midi_clip", start, length);
}

export interface TakeLaneTrackOptions {
  trackIndex?: number;
  /** Number of pre-existing (empty) take lanes */
  initialLanes?: number;
  /** Length in beats for lane clips Live isn't told a length for (audio) */
  clipLength?: number;
  /** Make each lane's create_*_clip return a non-existent ref (id 0) */
  clipCreationFails?: boolean;
  /** 0 makes it an audio track, which an audio source can be copied to */
  hasMidiInput?: number;
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
 *
 * The track answers `create_midi_clip` too, landing on its MAIN lane the way
 * Live does even on a track that has take lanes — that's the call a promote
 * makes.
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
    hasMidiInput = 1,
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

    const owner: ClipOwner = {
      clips: laneClips,
      props: laneProps,
      pathFor: (index) =>
        livePath.track(trackIndex).takeLane(laneIndex).arrangementClip(index),
      clipLength,
      clipCreationFails,
    };
    const createClip = (
      kind: string,
      startBeats: unknown,
      lengthBeats?: unknown,
    ): unknown[] => createOwnedClip(owner, kind, startBeats, lengthBeats);

    registerMockObject(laneId, {
      path: String(livePath.track(trackIndex).takeLane(laneIndex)),
      type: "TakeLane",
      properties: laneProps,
      methods: {
        create_midi_clip: (_start, _length) =>
          createClip("is_midi_clip", _start, _length),
        create_audio_clip: (_file, _start) =>
          createClip("is_audio_clip", _start),
      },
    });

    return laneId;
  };

  for (let i = 0; i < initialLanes; i++) {
    laneIds.push(registerLane(i));
  }

  const mainLaneClips: string[] = [];
  const trackProps: Record<string, unknown> = {
    has_midi_input: hasMidiInput,
    is_foldable: 0,
    take_lanes: children(...laneIds),
    arrangement_clips: children(),
  };
  const mainLane: ClipOwner = {
    clips: mainLaneClips,
    props: trackProps,
    pathFor: (index) => livePath.track(trackIndex).arrangementClip(index),
    clipLength,
    clipCreationFails,
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
      create_midi_clip: (start, length) =>
        createOwnedClip(mainLane, "is_midi_clip", start, length),
    },
  });
}

/** Something clips can be created on: a take lane, or a track's main lane. */
interface ClipOwner {
  /** The owner's clip-id list, mutated in place */
  clips: string[];
  /** The owner's mutable props, whose `arrangement_clips` grows */
  props: Record<string, unknown>;
  /** Builds the clip path for a given index in that list */
  pathFor: (index: number) => PathLike;
  clipLength: number;
  clipCreationFails: boolean;
}

/**
 * The stateful half of Live's `create_midi_clip` / `create_audio_clip`:
 * registers a fresh arrangement clip on the owner and grows its clip list.
 * @param owner - Where the clip lands
 * @param kind - The `is_*_clip` property to set on it
 * @param startBeats - Start position Live was given
 * @param lengthBeats - Length Live was given (audio takes it from the sample)
 * @returns The Live-style `["id", <id>]` ref
 */
function createOwnedClip(
  owner: ClipOwner,
  kind: string,
  startBeats: unknown,
  lengthBeats?: unknown,
): unknown[] {
  // Simulate Live failing to create the clip (returns the "no object" ref).
  if (owner.clipCreationFails) {
    return ["id", "0"];
  }

  const clipId = `tl_clip_${uid++}`;
  const start = typeof startBeats === "number" ? startBeats : 0;
  // Honor the length Live was asked for, so a wrong one can't read back right.
  // create_audio_clip takes its length from the sample instead.
  const length =
    typeof lengthBeats === "number" ? lengthBeats : owner.clipLength;

  registerMockObject(clipId, {
    path: owner.pathFor(owner.clips.length),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      [kind]: 1,
      length,
      start_time: start,
      end_time: start + length,
    },
  });
  owner.clips.push(clipId);
  owner.props.arrangement_clips = children(...owner.clips);

  return ["id", clipId];
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
      path: livePath
        .track(trackIndex)
        .takeLane(laneIndex)
        .arrangementClip(laneClips.length),
      type: "Clip",
      properties: { is_arrangement_clip: 1, start_time: start, end_time: end },
    });
    laneClips.push(clipId);
  }

  laneProps.arrangement_clips = children(...laneClips);
}
