// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Mocks the take-lane duplicate suites share. */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "../duplicate.ts";

/** What a lane copy always says it left behind. */
export const CLIPS_ONLY =
  "clips only: a take lane takes no devices, routing, mixer settings or session clips";

/** One take lane's entry in the result of a copy onto lanes. */
export interface LaneCopyEntry {
  id: string;
  path: string;
  created?: true;
  name?: string;
  clips: Array<{ id?: string; path?: string; ok?: false; detail?: string }>;
  detail: string;
}

/**
 * Copy a source onto the take lanes a toPath names.
 * @param args - The duplicate args beyond `type: "track"`
 * @returns The result, as the caller expects it
 */
export async function duplicateToLanes<T>(
  args: Record<string, unknown>,
): Promise<T> {
  return (await duplicate({ type: "track", ...args })) as T;
}

/** The one note every take-lane source carries, so a copy can be checked for it. */
export const SOURCE_NOTE = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

/** Register the live_set time signature mock. */
export function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/**
 * Register a source clip that already lives on a take lane (track 0, lane 0) —
 * the shape a promote reads from.
 * @param extraProps - Clip properties merged over the MIDI defaults
 */
export function registerTakeLaneSource(
  extraProps: Record<string, number> = {},
): void {
  registerMockObject("tl_src_clip", {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
    type: "Clip",
    properties: arrangementClipProperties(true, 0, extraProps),
    methods: {
      get_notes_extended: () => JSON.stringify({ notes: [SOURCE_NOTE] }),
    },
  });
}

export interface SourceClipOptions {
  /** Extra clip properties merged over the defaults (e.g. `color`). */
  extraProps?: Record<string, number>;
  /** Custom get_notes_extended implementation (e.g. windowed pickup reads). */
  getNotesExtended?: (...args: unknown[]) => string;
}

/**
 * Register a source arrangement clip (track 0, main lane) for duplication.
 * @param midi - Whether the source is a MIDI clip
 * @param notes - Notes returned by the source's get_notes_extended
 * @param options - Extra clip properties / custom get_notes_extended
 */
export function registerArrangementSource(
  midi: boolean,
  notes: Array<Record<string, number>> = [SOURCE_NOTE],
  options: SourceClipOptions = {},
): void {
  registerMockObject("src_clip", {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: arrangementClipProperties(midi, 0, options.extraProps),
    methods: {
      get_notes_extended:
        options.getNotesExtended ?? (() => JSON.stringify({ notes })),
    },
  });
}

/**
 * Register one clip on the source track's main arrangement lane, for a copy
 * that reads the whole lane.
 * @param index - Its place in the track's arrangement_clips
 * @param startBeats - Where it starts, in Ableton beats
 * @param extraProps - Clip properties merged over the MIDI defaults
 * @returns The clip's mock id
 */
export function registerMainLaneClip(
  index: number,
  startBeats: number,
  extraProps: Record<string, unknown> = {},
): string {
  const id = `src_clip_${index}`;

  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(index),
    type: "Clip",
    properties: arrangementClipProperties(true, startBeats, extraProps),
    methods: {
      get_notes_extended: () => JSON.stringify({ notes: [SOURCE_NOTE] }),
    },
  });

  return id;
}

/**
 * Register the source track (index 0) holding one main-lane clip per start
 * position, plus the live_set every position is spelled against.
 * @param starts - One clip per start position, in Ableton beats
 * @param trackProps - Track properties merged over the MIDI defaults
 * @param clipProps - Properties merged over each clip's defaults
 */
export function registerMainLaneSource(
  starts: number[],
  trackProps: Record<string, unknown> = {},
  clipProps: Record<string, unknown> = {},
): void {
  registerLiveSet();

  const clipIds = starts.map((start, index) =>
    registerMainLaneClip(index, start, clipProps),
  );

  registerMockObject("src_track", {
    path: livePath.track(0),
    properties: {
      has_midi_input: 1,
      is_foldable: 0,
      take_lanes: children(),
      arrangement_clips: children(...clipIds),
      ...trackProps,
    },
  });
}

/**
 * Register the source take lane (track 0, lane 0) holding one clip per start
 * position, plus the track it sits on and the live_set. Register a main-lane
 * source after this one to have both on the track, passing the lane's id as the
 * track's `take_lanes`.
 * @param starts - One clip per start position, in Ableton beats
 * @param trackProps - Track properties merged over the MIDI defaults
 * @param clipProps - Properties merged over each clip's defaults
 * @returns The lane's mock id
 */
export function registerLaneSource(
  starts: number[],
  trackProps: Record<string, unknown> = {},
  clipProps: Record<string, unknown> = {},
): string {
  registerLiveSet();

  const clipIds = starts.map((start, index) => {
    const id = `src_lane_clip_${index}`;

    registerMockObject(id, {
      path: livePath.track(0).takeLane(0).arrangementClip(index),
      type: "Clip",
      properties: arrangementClipProperties(true, start, clipProps),
      methods: {
        get_notes_extended: () => JSON.stringify({ notes: [SOURCE_NOTE] }),
      },
    });

    return id;
  });

  registerMockObject("src_lane", {
    path: livePath.track(0).takeLane(0),
    type: "TakeLane",
    properties: { name: "Take", arrangement_clips: children(...clipIds) },
  });
  registerMockObject("src_track", {
    path: livePath.track(0),
    properties: {
      has_midi_input: 1,
      is_foldable: 0,
      take_lanes: children("src_lane"),
      arrangement_clips: children(),
      ...trackProps,
    },
  });

  return "src_lane";
}

/**
 * The properties a source arrangement clip answers, so a copy can be rebuilt
 * from it.
 * @param midi - Whether the clip is MIDI
 * @param startBeats - Where it starts, in Ableton beats
 * @param extraProps - Properties merged over the defaults
 * @returns The clip's properties
 */
function arrangementClipProperties(
  midi: boolean,
  startBeats: number,
  extraProps: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    is_midi_clip: midi ? 1 : 0,
    is_arrangement_clip: 1,
    length: 4,
    start_time: startBeats,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 4,
    looping: 1,
    signature_numerator: 4,
    signature_denominator: 4,
    ...extraProps,
  };
}
