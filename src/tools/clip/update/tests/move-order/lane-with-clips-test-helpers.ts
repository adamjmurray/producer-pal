// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Track 0 with arrangement clips at chosen spans, answering a duplicate or a new
// clip the way Live does for one it can place: it clears the clips it covers
// whole and trims one it only reaches into (not one it lands in the middle of).

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  deleteMockObject,
  lookupMockObject,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** A clip to put on the lane. */
export interface LaneClip {
  id: string;
  /** Where it starts, in beats */
  start: number;
  /** How long it is, in beats */
  length: number;
  /** Whether it loops; its loop is its whole length */
  looping?: boolean;
}

/**
 * Register a 4/4 Live Set and track 0 holding the clips.
 * @param clips - The clips, in lane order
 * @param declines - Ids of clips Live makes no copy of: it answers a duplicate
 *   of one with an id that resolves to nothing
 * @returns The track mock, which records the duplicates and the deletes
 */
export function setUpLane(
  clips: LaneClip[],
  declines: string[] = [],
): RegisteredMockObject {
  const onLane: string[] = [];
  let copies = 0;

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const place = (
    id: string,
    start: number,
    length: number,
    looping = false,
  ): void => {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(onLane.length),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: start,
        end_time: start + length,
        looping: looping ? 1 : 0,
        loop_start: 0,
        loop_end: length,
        start_marker: 0,
        end_marker: length,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
    onLane.push(id);
  };

  const sync = (): void => {
    const track = lookupMockObject("lane-track");

    if (track != null) {
      track.properties.arrangement_clips = children(...onLane);
    }

    // A clip's path is its place in the lane, so it moves when one before it goes.
    for (const [at, id] of onLane.entries()) {
      registerMockObject(id, {
        path: livePath.track(0).arrangementClip(at),
        type: "Clip",
        properties: lookupMockObject(id)?.properties,
      });
    }
  };

  const remove = (id: string): void => {
    onLane.splice(onLane.indexOf(id), 1);
    deleteMockObject(id);
    sync();
  };

  // What Live does to the clips a new one lands on: removes those it covers
  // whole and trims the front or back of one it only reaches into.
  const clear = (from: number, to: number): void => {
    // Read first: removing a clip changes the list being walked.
    const lane = onLane.map((id) => ({
      id,
      props: lookupMockObject(id)?.properties ?? {},
    }));

    for (const { id, props } of lane) {
      const start = props.start_time as number;
      const end = props.end_time as number;

      if (start >= from && end <= to) {
        remove(id);
      } else if (start >= from && start < to) {
        props.start_time = to;
      } else if (end > from && end <= to) {
        props.end_time = from;
      }
    }
  };

  for (const { id, start, length, looping } of clips) {
    place(id, start, length, looping);
  }

  return registerMockObject("lane-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { track_index: 0, arrangement_clips: children(...onLane) },
    methods: {
      duplicate_clip_to_arrangement: (source, at) => {
        const sourceId = String(source).replace(/^id /, "");

        if (declines.includes(sourceId)) {
          return ["id", 0];
        }

        const was = lookupMockObject(sourceId)?.properties ?? {};
        const length = (was.end_time as number) - (was.start_time as number);
        const start = at as number;

        clear(start, start + length);

        const copy = `copy-${String(++copies)}`;

        place(copy, start, length);
        sync();

        return ["id", copy];
      },
      create_midi_clip: (at, length) => {
        clear(at as number, (at as number) + (length as number));
        place("90001", at as number, length as number);
        sync();

        return ["id", "90001"];
      },
      delete_clip: (arg) => {
        const id = String(arg).replace(/^id /, "");

        if (onLane.includes(id)) {
          remove(id);
        }

        return null;
      },
    },
  });
}

/**
 * The clips the track was asked to copy, in order.
 * @param track - The track mock
 * @returns The ids copied
 */
export function copiedSources(track: RegisteredMockObject): string[] {
  return track.call.mock.calls
    .filter(([method]) => method === "duplicate_clip_to_arrangement")
    .map(([, source]) => String(source));
}
