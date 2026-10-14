// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** What a clip shows when it is copied to the arrangement. */
export interface CopyEvent {
  kind: "copy";
  trackIndex: number;
  /** The scratch clip's id */
  clipId: string;
  at: number;
  looping: boolean;
  loopStart: number;
  loopEnd: number;
  startMarker: number;
  /** Whether the copy carries envelopes, so writes to the lane */
  envelopes: boolean;
}

/** Every call that changed the Set, in order. */
export type WorldEvent =
  | CopyEvent
  | { kind: "delete"; id: string }
  | { kind: "clear-envelopes"; id: string }
  | { kind: "set"; property: string; value: unknown }
  | { kind: "scene-made"; index: number }
  | { kind: "scene-removed"; index: number }
  | { kind: "slot-cleared"; slot: string };

export interface StampWorldOptions {
  /** Overrides for the source clip's properties */
  source?: Record<string, unknown>;
  /** The track the source sits on; the copies go to track 0 */
  sourceTrack?: number;
  /** Whether the Set already ends in an empty scene */
  lastSceneEmpty?: boolean;
  /** Arrangement clips already on track 0; a copy over one removes it */
  existing?: Array<{ start: number; end: number }>;
}

export interface StampWorld {
  events: WorldEvent[];
  /** The source session clip, on track `sourceTrack`, scene 0 */
  source: RegisteredMockObject;
  /** Called before each arrangement copy, with how many came before it */
  beforeCopy: (count: number) => void;
  /** Called before each arrangement delete */
  beforeDelete: (count: number) => void;
  /** Called before each marker write on a scratch clip */
  beforeSet: (property: string) => void;
  /** Called before a scratch slot copy, with how many came before it */
  beforeSlotCopy: (count: number) => void;
  /** Called before envelopes are cleared */
  beforeClear: () => void;
  /** Called before a scratch slot's clip is deleted */
  beforeSlotClear: () => void;
  /** Whether Live quietly declines an arrangement copy (the count before it) */
  declinesCopy: (count: number) => boolean;
  /** Whether Live quietly declines a slot copy (the count before it) */
  declinesSlotCopy: (count: number) => boolean;
  sceneCount: () => number;
  copies: () => CopyEvent[];
  /** The copies taken from the scratch clip while it still had envelopes */
  stamps: () => CopyEvent[];
  /** Copies in the arrangement that were not deleted */
  placedIds: () => string[];
}

const SOURCE_DEFAULTS = {
  is_arrangement_clip: 0,
  is_midi_clip: 1,
  has_envelopes: 1,
  looping: 1,
  loop_start: 0,
  loop_end: 4,
  start_marker: 0,
  end_marker: 4,
  length: 4,
};

/** Everything the registered objects share. */
interface State {
  world: StampWorld;
  events: WorldEvent[];
  sceneIds: string[];
  /** The copies made in the arrangement and not deleted */
  placed: Set<string>;
  counts: {
    copies: number;
    deletes: number;
    slotCopies: number;
    clips: number;
    arr: number;
  };
  liveSetProps: Record<string, unknown>;
  slotProps: Map<string, { has_clip: number }>;
  sourceProps: Record<string, unknown>;
  sourceTrack: number;
}

/**
 * A Set with a session clip on scene 0, a destination track 0 that copies
 * clips to the arrangement, and scenes that come and go. Every copy to the
 * arrangement is recorded with what the clip showed at that moment.
 * @param options - How the Set starts
 * @returns The Set's recorder and hooks
 */
export function registerStampWorld(
  options: StampWorldOptions = {},
): StampWorld {
  mockNonExistentObjects();

  const events: WorldEvent[] = [];
  const state: State = {
    world: undefined as unknown as StampWorld,
    events,
    sceneIds: [],
    placed: new Set(),
    counts: { copies: 0, deletes: 0, slotCopies: 0, clips: 0, arr: 0 },
    liveSetProps: { tracks: children("world_track_0") },
    slotProps: new Map(),
    sourceProps: { ...SOURCE_DEFAULTS, ...options.source },
    sourceTrack: options.sourceTrack ?? 0,
  };
  const world: StampWorld = {
    events,
    source: undefined as unknown as RegisteredMockObject,
    beforeCopy: () => {},
    beforeDelete: () => {},
    beforeSet: () => {},
    beforeSlotCopy: () => {},
    beforeClear: () => {},
    beforeSlotClear: () => {},
    declinesCopy: () => false,
    declinesSlotCopy: () => false,
    sceneCount: () => state.sceneIds.length,
    copies: () => events.filter((event) => event.kind === "copy"),
    stamps: () => world.copies().filter((event) => event.envelopes),
    placedIds: () => [...state.placed],
  };

  state.world = world;

  for (const trackIndex of [0, 1]) {
    registerTrack(state, trackIndex, options.existing ?? []);
  }

  registerLiveSet(state);
  addScene(state, 0, false);
  world.source = registerMockObject("world_source", {
    path: livePath.track(state.sourceTrack).clipSlot(0).clip(),
    type: "Clip",
    properties: state.sourceProps,
  });
  slotPropsAt(state, state.sourceTrack, 0).has_clip = 1;

  if (options.lastSceneEmpty === true) {
    addScene(state, 1, true);
  }

  return world;
}

// --- Helpers below main exports ---

/**
 * @param state - The Set
 * @param trackIndex - The slot's track
 * @param sceneIndex - The slot's scene
 * @returns The slot's properties, which the mock reads live
 */
function slotPropsAt(
  state: State,
  trackIndex: number,
  sceneIndex: number,
): { has_clip: number } {
  return state.slotProps.get(
    String(livePath.track(trackIndex).clipSlot(sceneIndex)),
  ) as { has_clip: number };
}

/**
 * @param state - The Set
 * @param index - Where the scene goes
 * @param empty - Whether it holds no clips
 * @returns Live's answer to create_scene
 */
function addScene(state: State, index: number, empty: boolean): unknown {
  const id = `world_scene_${state.sceneIds.length}`;

  state.sceneIds.splice(index, 0, id);
  state.liveSetProps.scenes = children(...state.sceneIds);
  registerMockObject(id, {
    path: livePath.scene(index),
    type: "Scene",
    properties: { is_empty: empty ? 1 : 0 },
  });

  for (const trackIndex of [0, 1]) {
    registerSlot(state, trackIndex, index);
  }

  return ["id", id];
}

/**
 * @param state - The Set
 */
function registerLiveSet(state: State): void {
  registerMockObject("world_live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: state.liveSetProps,
    methods: {
      create_scene: (index) => {
        state.events.push({ kind: "scene-made", index: Number(index) });

        return addScene(state, Number(index), true);
      },
      delete_scene: (index) => {
        state.events.push({ kind: "scene-removed", index: Number(index) });
        state.sceneIds.splice(Number(index), 1);
        state.liveSetProps.scenes = children(...state.sceneIds);
      },
    },
  });
}

/**
 * A clip slot that copies its clip to another slot and clears itself.
 * @param state - The Set
 * @param trackIndex - The slot's track
 * @param sceneIndex - The slot's scene
 */
function registerSlot(
  state: State,
  trackIndex: number,
  sceneIndex: number,
): void {
  const path = String(livePath.track(trackIndex).clipSlot(sceneIndex));
  const properties = { has_clip: 0 };

  state.slotProps.set(path, properties);
  registerMockObject(`world_slot_${trackIndex}_${sceneIndex}`, {
    path,
    type: "ClipSlot",
    properties,
    methods: {
      duplicate_clip_to: (destId) => {
        const count = state.counts.slotCopies++;

        state.world.beforeSlotCopy(count);

        if (!state.world.declinesSlotCopy(count)) {
          copyToSlot(state, path, String(destId));
        }
      },
      delete_clip: () => {
        state.world.beforeSlotClear();
        properties.has_clip = 0;
        state.events.push({ kind: "slot-cleared", slot: path });
      },
    },
  });
}

/**
 * Live's ClipSlot.duplicate_clip_to: a fresh clip with the source's state.
 * @param state - The Set
 * @param fromSlotPath - The slot copied from
 * @param destId - The destination slot's id
 */
function copyToSlot(state: State, fromSlotPath: string, destId: string): void {
  const dest = lookupMockObject(destId.replace(/^id /, ""));

  if (dest == null) {
    return;
  }

  const fromSource = fromSlotPath.includes(
    `tracks ${state.sourceTrack} clip_slots 0`,
  );
  const from = fromSource
    ? state.sourceProps
    : (lookupMockObject(undefined, `${fromSlotPath} clip`)?.properties ??
      state.sourceProps);

  registerScratchClip(state, `${dest.path} clip`, { ...from });
  (state.slotProps.get(dest.path) as { has_clip: number }).has_clip = 1;
}

/**
 * A session clip whose marker writes land in its properties.
 * @param state - The Set
 * @param path - The clip's path
 * @param properties - What it reads back
 */
function registerScratchClip(
  state: State,
  path: string,
  properties: Record<string, unknown>,
): void {
  const id = `world_clip_${state.counts.clips++}`;
  const clip = registerMockObject(id, {
    path,
    type: "Clip",
    properties,
    methods: {
      clear_all_envelopes: () => {
        state.world.beforeClear();
        properties.has_envelopes = 0;
        state.events.push({ kind: "clear-envelopes", id });
      },
    },
  });

  clip.set.mockImplementation((property: string, value: unknown) => {
    state.world.beforeSet(property);
    properties[property] = value;
    state.events.push({ kind: "set", property, value });
  });
}

/**
 * A track that copies clips to the arrangement, clearing the ones it covers.
 * @param state - The Set
 * @param trackIndex - The track
 * @param existing - Clips already on track 0's lane
 */
function registerTrack(
  state: State,
  trackIndex: number,
  existing: Array<{ start: number; end: number }>,
): void {
  const lane = new Map<string, { start: number; end: number }>();
  const trackProps: Record<string, unknown> = {
    has_midi_input: 1,
    track_index: trackIndex,
    arrangement_clips: [],
  };

  const listLane = (): void => {
    trackProps.arrangement_clips = children(...lane.keys());
  };

  if (trackIndex === 0) {
    for (const [index, span] of existing.entries()) {
      const id = `world_existing_${index}`;

      registerMockObject(id, {
        path: livePath.track(0).arrangementClip(100 + index),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          start_time: span.start,
          end_time: span.end,
        },
      });
      lane.set(id, span);
    }

    listLane();
  }

  registerMockObject(`world_track_${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: trackProps,
    methods: {
      duplicate_clip_to_arrangement: (clipId, at) => {
        const placed = copyToArrangement(state, trackIndex, lane, clipId, at);

        listLane();

        return placed;
      },
      delete_clip: (id) => {
        const bare = String(id).replace(/^id /, "");

        state.world.beforeDelete(state.counts.deletes++);
        state.placed.delete(bare);
        lane.delete(bare);
        listLane();
        state.events.push({ kind: "delete", id: String(id) });
      },
    },
  });
}

/**
 * Track.duplicate_clip_to_arrangement: records the copy with what the clip
 * shows, and clears the clips it covers whole.
 * @param state - The Set
 * @param trackIndex - The track
 * @param lane - The track's clips and their spans
 * @param clipId - The clip copied
 * @param at - Where it goes, in beats
 * @returns Live's answer
 */
function copyToArrangement(
  state: State,
  trackIndex: number,
  lane: Map<string, { start: number; end: number }>,
  clipId: unknown,
  at: unknown,
): unknown {
  const count = state.counts.copies++;

  state.world.beforeCopy(count);

  const bare = String(clipId).replace(/^id /, "");
  const props = lookupMockObject(bare)?.properties ?? {};

  state.events.push({
    kind: "copy",
    trackIndex,
    clipId: bare,
    at: Number(at),
    looping: props.looping === 1,
    loopStart: props.loop_start as number,
    loopEnd: props.loop_end as number,
    startMarker: props.start_marker as number,
    envelopes: props.has_envelopes === 1,
  });

  if (state.world.declinesCopy(count)) {
    return ["id", 0];
  }

  const id = `world_arrangement_${state.counts.arr++}`;
  const end = Number(at) + copyLength(props);

  // Live clears the clips a copy covers whole.
  for (const [laneId, span] of lane) {
    if (span.start >= Number(at) && span.end <= end) {
      lane.delete(laneId);
      registerMockObject(laneId, { path: "" });
    }
  }

  registerMockObject(id, {
    path: livePath.track(trackIndex).arrangementClip(state.counts.arr),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      start_time: Number(at),
      end_time: end,
    },
  });
  lane.set(id, { start: Number(at), end });
  state.placed.add(id);

  return ["id", id];
}

/**
 * How long an arrangement copy of a session clip is: a looped clip plays from
 * its start marker (or loop start, if sooner) to its loop end.
 * @param props - The clip's properties
 * @returns Length in beats
 */
function copyLength(props: Record<string, unknown>): number {
  const loopEnd = props.loop_end as number;

  return props.looping === 1
    ? loopEnd -
        Math.min(props.start_marker as number, props.loop_start as number)
    : loopEnd - (props.start_marker as number);
}
