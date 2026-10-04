// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";

export const MAIN: ArrangementLane = { kind: "track", trackIndex: 0 };
export const TAKE: ArrangementLane = {
  kind: "take-lane",
  trackIndex: 0,
  laneIndex: 1,
};

/** One clip on a lane, as the registry should answer for it. */
export interface Span {
  id: string;
  start: number;
  end: number;
  /** The path to register it at; defaults to its place on the lane. */
  path?: string;
}

/** A lane with a clip a write will cut into, one it leaves alone either side. */
export const LANE_BEFORE_WRITE: Span[] = [
  { id: "before", start: 0, end: 8 },
  { id: "hit", start: 8, end: 24 },
  { id: "next", start: 24, end: 32 },
  { id: "far", start: 100, end: 108 },
];

/** {@link LANE_BEFORE_WRITE} after "hit" was cut short and "new" took its tail. */
export const LANE_AFTER_WRITE: Span[] = [
  { id: "before", start: 0, end: 8 },
  { id: "hit", start: 8, end: 12 },
  { id: "new", start: 12, end: 24 },
  { id: "next", start: 24, end: 32 },
  { id: "far", start: 100, end: 108 },
];

const clipMocks = new Map<string, RegisteredMockObject>();

/**
 * Start from an empty registry. Call from `beforeEach`.
 */
export function resetLaneMocks(): void {
  clearMockRegistry();
  mockNonExistentObjects();
  clipMocks.clear();
}

/**
 * Put these clips on the track's main lane, replacing whatever was there.
 * @param spans - The clips, in Live's order
 * @returns The track mock, so a test can change its clip list directly
 */
export function setMainLane(spans: Span[]): RegisteredMockObject {
  setClips(spans, (index) => livePath.track(0).arrangementClip(index));

  return registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * Put these clips on take lane 1, replacing whatever was there. The track's own
 * list is untouched.
 * @param spans - The clips, in Live's order
 */
export function setTakeLane(spans: Span[]): void {
  setClips(spans, (index) =>
    livePath.track(0).takeLane(1).arrangementClip(index),
  );
  registerMockObject("lane_1", {
    path: livePath.track(0).takeLane(1),
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * Register each clip, in place when it already exists.
 * @param spans - The clips, in Live's order
 * @param pathAt - The path a clip at that index sits on
 */
function setClips(spans: Span[], pathAt: (index: number) => string): void {
  for (const [index, { id, start, end, path }] of spans.entries()) {
    clipMocks.set(
      id,
      registerMockObject(id, {
        path: path ?? pathAt(index),
        type: "Clip",
        properties: { start_time: start, end_time: end },
      }),
    );
  }
}

/**
 * Forget every read so far, so a test sees only what a step cost.
 */
export function clearReads(): void {
  for (const mock of clipMocks.values()) {
    mock.get.mockClear();
  }
}

/**
 * @param id - A clip's id
 * @returns Whether its span was read since the last {@link clearReads}
 */
export function wasRead(id: string): boolean {
  return (clipMocks.get(id)?.get.mock.calls.length ?? 0) > 0;
}

/**
 * @param ids - Clip ids
 * @returns The ids whose span was read since the last {@link clearReads}
 */
export function readOf(ids: string[]): string[] {
  return ids.filter(wasRead);
}
