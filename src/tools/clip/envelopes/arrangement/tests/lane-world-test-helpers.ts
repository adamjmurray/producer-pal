// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** The arrangement clip the lane is written over. */
export const CLIP_ID = "700";

/** Where it starts and ends, in beats (bar 5 to bar 7 of 4/4). */
export const CLIP_START = 16;
export const CLIP_END = 24;

/** One call to `Track.duplicate_clip_to_arrangement`. */
export interface CopyCall {
  /** The clip copied: the original, the scratch clip, or the parked copy */
  source: string;
  at: number;
  /** The clip Live made, or null when it made none */
  made: string | null;
}

export interface LaneWorldOptions {
  /** Overrides for the arrangement clip's properties */
  clip?: Record<string, unknown>;
  /** Other clips on the track's main lane */
  neighbors?: Array<{ id: string; start: number; end: number }>;
  /** Whether the Set already ends in an empty scene */
  lastSceneEmpty?: boolean;
  /** Gives the track one take lane whose last clip ends here */
  takeLaneEnd?: number;
  /** Makes the track and its clip audio */
  audio?: boolean;
  /** Whether the track is frozen, so Live copies nothing to it */
  frozen?: boolean;
  /** Leaves the Set with no scenes, so there is no scratch slot to find */
  noScenes?: boolean;
  /** Whether Live makes no clip when asked to create one in a session slot */
  noScratchClip?: boolean;
}

/** What a hook says about the call it is shown. */
export interface CopyHookCall {
  /** How many copies came before this one */
  count: number;
  source: string;
  at: number;
}

export interface LaneWorld {
  /** Every copy to the arrangement, in order */
  copies: CopyCall[];
  /** Every id deleted from the arrangement, in order */
  deleted: string[];
  /** Every scene made, by index */
  scenesMade: number[];
  /** Called before each copy: throw to fail it, or return "decline" for Live's no-op */
  onCopy: (call: CopyHookCall) => "decline" | undefined;
  /** Called before each arrangement delete */
  onDelete: (id: string) => void;
  /** Called before the scratch clip is deleted */
  onSlotDelete: () => void;
  /** The ids on the main lane, in start order */
  laneIds: () => string[];
  sceneCount: () => number;
  /** The last audio scratch clip made, which the code under test sets up */
  audioScratch: RegisteredMockObject | null;
  /** Whether a scratch clip is left in a slot */
  scratchClipLeft: () => boolean;
}

interface Span {
  start: number;
  end: number;
}

/** Everything the registered objects share. */
interface State {
  world: LaneWorld;
  lane: Map<string, Span>;
  trackProps: Record<string, unknown>;
  songProps: Record<string, unknown>;
  sceneIds: string[];
  slotHasClip: Map<number, { has_clip: number }>;
  songLengthAtStart: number;
  takeLaneEnd: number | undefined;
  noScratchClip: boolean;
  audio: boolean;
  counts: { copies: number; made: number; clips: number };
}

/**
 * A Set with a MIDI track holding one arrangement clip (and any neighbors), a
 * session that can grow scenes, and a track that copies clips to the
 * arrangement the way Live does: a copy replaces the clips under its span.
 * @param options - How the Set starts
 * @returns The Set's recorder and hooks
 */
export function registerLaneWorld(options: LaneWorldOptions = {}): LaneWorld {
  mockNonExistentObjects();

  const world: LaneWorld = {
    copies: [],
    deleted: [],
    scenesMade: [],
    onCopy: () => undefined,
    onDelete: () => {},
    onSlotDelete: () => {},
    laneIds: () => [],
    sceneCount: () => 0,
    audioScratch: null,
    scratchClipLeft: () => false,
  };
  const state: State = {
    world,
    lane: new Map(),
    trackProps: {
      has_midi_input: options.audio === true ? 0 : 1,
      is_frozen: options.frozen === true ? 1 : 0,
    },
    songProps: {
      signature_numerator: 4,
      signature_denominator: 4,
    },
    sceneIds: [],
    slotHasClip: new Map(),
    songLengthAtStart: 32,
    takeLaneEnd: options.takeLaneEnd,
    noScratchClip: options.noScratchClip === true,
    audio: options.audio === true,
    counts: { copies: 0, made: 0, clips: 0 },
  };

  world.laneIds = () =>
    [...state.lane.entries()]
      .toSorted((a, b) => a[1].start - b[1].start)
      .map(([id]) => id);
  world.sceneCount = () => state.sceneIds.length;
  world.scratchClipLeft = () =>
    [...state.slotHasClip.values()].some((slot) => slot.has_clip === 1);

  registerOriginal(state, options.clip ?? {});

  for (const [index, neighbor] of (options.neighbors ?? []).entries()) {
    registerLaneClip(state, neighbor.id, 900 + index, {
      start: neighbor.start,
      end: neighbor.end,
    });
  }

  registerSong(state);
  registerTrack(state);
  refreshScenes(state);

  if (options.noScenes !== true) {
    addScene(state, 0, false);
  }

  if (options.lastSceneEmpty === true) {
    addScene(state, 1, true);
  }

  refreshLane(state);

  return world;
}

// --- Helpers below main exports ---

/**
 * @param state - The Set
 * @param overrides - Properties to set on the original clip
 */
function registerOriginal(
  state: State,
  overrides: Record<string, unknown>,
): void {
  registerLaneClip(
    state,
    CLIP_ID,
    0,
    { start: CLIP_START, end: CLIP_END },
    {
      name: "Original",
      ...(state.audio && { is_midi_clip: 0, is_audio_clip: 1, warping: 0 }),
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      ...overrides,
    },
  );
}

/**
 * @param state - The Set
 * @param id - The clip's id
 * @param pathIndex - Where it sits in the track's clip list
 * @param span - Where it sits on the timeline
 * @param extra - More properties
 */
function registerLaneClip(
  state: State,
  id: string,
  pathIndex: number,
  span: Span,
  extra: Record<string, unknown> = {},
): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(pathIndex),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      start_time: span.start,
      end_time: span.end,
      ...extra,
    },
  });
  state.lane.set(id, span);
}

/**
 * @param state - The Set
 */
function registerSong(state: State): void {
  registerMockObject("song", {
    path: livePath.liveSet,
    type: "Song",
    properties: state.songProps,
    methods: {
      create_scene: (index) => {
        state.world.scenesMade.push(Number(index));

        return addScene(state, Number(index), true);
      },
      delete_scene: (index) => {
        const [id] = state.sceneIds.splice(Number(index), 1);

        deleteMockObject(id as string);
        refreshScenes(state);
      },
    },
  });
}

/**
 * @param state - The Set
 * @param index - Where the scene goes
 * @param empty - Whether it holds no clips
 * @returns Live's answer to create_scene
 */
function addScene(state: State, index: number, empty: boolean): unknown {
  const id = `scene${state.sceneIds.length}`;

  state.sceneIds.splice(index, 0, id);
  registerMockObject(id, {
    path: livePath.scene(index),
    type: "Scene",
    properties: { is_empty: empty ? 1 : 0 },
  });

  const properties = { has_clip: 0 };

  state.slotHasClip.set(index, properties);
  registerMockObject(`slot${index}`, {
    path: livePath.track(0).clipSlot(index),
    type: "ClipSlot",
    properties,
    methods: {
      create_clip: (length) => {
        if (state.noScratchClip) {
          return;
        }

        properties.has_clip = 1;
        registerMockObject(`carrier${index}`, {
          path: livePath.track(0).clipSlot(index).clip(),
          type: "Clip",
          properties: {
            is_arrangement_clip: 0,
            is_midi_clip: 1,
            length: Number(length),
          },
        });
      },
      create_audio_clip: () => {
        if (state.noScratchClip) {
          return;
        }

        properties.has_clip = 1;

        const clip = registerMockObject(`carrier${index}`, {
          path: livePath.track(0).clipSlot(index).clip(),
          type: "Clip",
          properties: {
            is_arrangement_clip: 0,
            is_audio_clip: 1,
            length: 4,
          },
        });

        // The scratch clip's length is set after it is made.
        clip.set.mockImplementation((property: string, value: unknown) => {
          clip.properties[property] = value;
        });
        state.world.audioScratch = clip;
      },
      delete_clip: () => {
        state.world.onSlotDelete();
        properties.has_clip = 0;
        deleteMockObject(`carrier${index}`);
      },
    },
  });
  refreshScenes(state);

  return ["id", id];
}

/**
 * @param state - The Set
 */
function refreshScenes(state: State): void {
  state.songProps.scenes = children(...state.sceneIds);
}

/**
 * @param state - The Set
 */
function registerTrack(state: State): void {
  registerMockObject("track0", {
    path: livePath.track(0),
    type: "Track",
    properties: state.trackProps,
    methods: {
      duplicate_clip_to_arrangement: (sourceId, at) =>
        copyToArrangement(state, String(sourceId).replace(/^id /, ""), at),
      delete_clip: (id) => {
        const bare = String(id).replace(/^id /, "");

        state.world.onDelete(bare);
        state.world.deleted.push(bare);
        state.lane.delete(bare);
        deleteMockObject(bare);
        refreshLane(state);
      },
    },
  });
}

/**
 * Track.duplicate_clip_to_arrangement: a copy of the clip, replacing the clips
 * under its span. A copy of an arrangement clip keeps its properties.
 * @param state - The Set
 * @param sourceId - The clip copied
 * @param at - Where it goes, in beats
 * @returns Live's answer
 */
function copyToArrangement(
  state: State,
  sourceId: string,
  at: unknown,
): unknown {
  const count = state.counts.copies++;
  const start = Number(at);
  const call: CopyCall = { source: sourceId, at: start, made: null };

  state.world.copies.push(call);

  if (
    state.world.onCopy({ count, source: sourceId, at: start }) === "decline"
  ) {
    return ["id", 0];
  }

  const source = lookupMockObject(sourceId)?.properties ?? {};
  const length =
    source.is_arrangement_clip === 1
      ? (source.end_time as number) - (source.start_time as number)
      : ((source.loop_end ?? source.length) as number);
  const end = start + length;
  const id = String(800 + state.counts.made++);

  for (const [laneId, span] of state.lane) {
    if (span.start < end && span.end > start) {
      state.lane.delete(laneId);
      deleteMockObject(laneId);
    }
  }

  const kept = source.is_arrangement_clip === 1 ? source : {};

  registerLaneClip(
    state,
    id,
    100 + state.counts.clips++,
    { start, end },
    {
      ...kept,
      start_time: start,
      end_time: end,
    },
  );
  refreshLane(state);
  call.made = id;

  return ["id", id];
}

/**
 * Bring the track's clip list and the Set's length up to date.
 * @param state - The Set
 */
function refreshLane(state: State): void {
  state.trackProps.arrangement_clips = children(...state.lane.keys());
  state.trackProps.take_lanes =
    state.takeLaneEnd == null ? children() : children("lane0");

  if (state.takeLaneEnd != null) {
    registerMockObject("lane0", {
      path: `${livePath.track(0)} take_lanes 0`,
      type: "TakeLane",
      properties: { arrangement_clips: children("lane0clip") },
    });
    registerMockObject("lane0clip", {
      path: `${livePath.track(0)} take_lanes 0 arrangement_clips 0`,
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        start_time: state.takeLaneEnd - 4,
        end_time: state.takeLaneEnd,
      },
    });
  }

  const ends = [...state.lane.values()].map((span) => span.end);

  state.songProps.song_length = Math.max(state.songLengthAtStart, ...ends);
}
