// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A track whose arrangement answers the way Live's does, so a test drives the
// real clearing and trimming code instead of a stand-in for it.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** A 4/4 Live Set, which every arrangement path spelling needs. */
export function registerLiveSet(): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/**
 * A main-lane MIDI clip on track 0.
 * @param id - The id to register it under
 * @param index - Its place in the track's arrangement_clips
 * @param start - Its start, in beats
 * @param end - Its end, in beats
 */
export function registerArrangementClip(
  id: string,
  index: number,
  start: number,
  end: number,
): void {
  registerMockObject(id, {
    path: livePath.track(0).arrangementClip(index),
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

/** The clips on the simulated track, in the order they were created. */
const laneClips: string[] = [];
let nextLaneClipId = 0;

/**
 * Track 0 with clips on it, run the way Live runs an arrangement: writing over
 * a span clears it, and whatever sticks out past the span survives as a NEW
 * clip with a new id. That re-creation is what a trimmed clip's entry has to
 * catch up with.
 * @param lengths - The clips' lengths in beats, laid out end to end with a gap
 * @returns Their ids, in the same order
 */
export function registerStackingTrack(lengths: number[]): string[] {
  laneClips.length = 0;
  nextLaneClipId = 0;
  registerLiveSet();
  registerMockObject("stacking-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { track_index: 0, arrangement_clips: children() },
    methods: {
      duplicate_clip_to_arrangement: (sourceId, start) => {
        const [sourceStart, sourceEnd] = laneClipSpan(bareId(sourceId));

        return ["id", writeLaneClip(start as number, sourceEnd - sourceStart)];
      },
      create_midi_clip: (start, length) => [
        "id",
        writeLaneClip(start as number, length as number),
      ],
      delete_clip: (id) => {
        removeLaneClip(bareId(id));

        return null;
      },
    },
  });

  let start = 0;

  return lengths.map((length) => {
    const id = addLaneClip(start, start + length);

    start += length + 4;

    return id;
  });
}

/**
 * The bare id of a `"id N"` argument.
 * @param arg - The argument Live was called with
 * @returns The id
 */
function bareId(arg: unknown): string {
  return String(arg).replace(/^id /, "");
}

/**
 * A clip's span on the simulated track.
 * @param id - The clip's id
 * @returns Its start and end, in beats
 */
function laneClipSpan(id: string): [number, number] {
  const properties = lookupMockObject(id)?.properties ?? {};

  return [properties.start_time as number, properties.end_time as number];
}

/**
 * Put a clip on the simulated track.
 * @param start - Its start, in beats
 * @param end - Its end, in beats
 * @returns Its id
 */
function addLaneClip(start: number, end: number): string {
  const id = `clip${String(++nextLaneClipId)}`;

  registerArrangementClip(id, nextLaneClipId, start, end);
  laneClips.push(id);
  syncLaneClips();

  return id;
}

/**
 * Take a clip off the simulated track.
 * @param id - The clip's id
 */
function removeLaneClip(id: string): void {
  const index = laneClips.indexOf(id);

  if (index < 0) {
    return;
  }

  deleteMockObject(id);
  laneClips.splice(index, 1);
  syncLaneClips();
}

/** Tell the track which clips it has now. */
function syncLaneClips(): void {
  const track = lookupMockObject("stacking-track");

  if (track != null) {
    track.properties.arrangement_clips = children(...laneClips);
  }
}

/**
 * Write a clip over a span, overwriting the way Live does: a clip the span
 * covers whole goes, and one it only reaches into is trimmed where it stands,
 * keeping its id. A new id comes from the copy the trimming dance places, not
 * from the trim itself.
 * @param start - Where the new clip starts, in beats
 * @param length - How long it is, in beats
 * @returns The new clip's id
 */
function writeLaneClip(start: number, length: number): string {
  const end = start + length;
  // Copied: clearing a clip away changes the list being walked.
  const present = [...laneClips];

  for (const id of present) {
    const [clipStart, clipEnd] = laneClipSpan(id);

    if (clipStart >= end || clipEnd <= start) {
      continue;
    }

    if (clipStart < start) {
      setLaneClipSpan(id, clipStart, start);
    } else if (clipEnd > end) {
      setLaneClipSpan(id, end, clipEnd);
    } else {
      removeLaneClip(id);
    }
  }

  return addLaneClip(start, end);
}

/**
 * Move a clip's edges, as a trim does.
 * @param id - The clip's id
 * @param start - Its new start, in beats
 * @param end - Its new end, in beats
 */
function setLaneClipSpan(id: string, start: number, end: number): void {
  const properties = lookupMockObject(id)?.properties;

  if (properties != null) {
    properties.start_time = start;
    properties.end_time = end;
  }
}

/**
 * The clips on the simulated track right now.
 * @returns Their ids, in creation order
 */
export function stackedLaneClips(): string[] {
  return [...laneClips];
}
