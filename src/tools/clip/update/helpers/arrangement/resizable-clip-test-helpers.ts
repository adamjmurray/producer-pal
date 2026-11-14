// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resizesLikeLiveClip } from "#src/test/mocks/registry/mock-clip-resize.ts";
import { setupSingleArrangementClip } from "../update-clip-test-helpers.ts";

/**
 * Give a registered arrangement clip a region, and make it resize the way Live
 * does, so a test can read back the span a resize landed at. Defaults to a
 * 1-bar MIDI clip at beat 0 in 4/4, looping over its whole length.
 * @param clip - A registered arrangement clip whose `get` reads its properties
 * @param props - Properties to override the defaults with
 * @param nextClipStart - Where the next clip on the lane starts
 */
export function makeResizable(
  clip: RegisteredMockObject,
  props: Record<string, unknown> = {},
  nextClipStart?: number,
): void {
  Object.assign(clip.properties, {
    is_arrangement_clip: 1,
    is_midi_clip: 1,
    is_audio_clip: 0,
    signature_numerator: 4,
    signature_denominator: 4,
    start_time: 0,
    end_time: 4,
    looping: 1,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 4,
    ...props,
  });
  resizesLikeLiveClip(clip, nextClipStart);
}

/**
 * Clip "789" alone on a track, resizing the way Live does (see makeResizable).
 * @param props - Properties to override the defaults with
 * @param nextClipStart - Where the next clip on the lane starts
 * @returns The clip and track mocks
 */
export function setupResizableClip(
  props: Record<string, unknown> = {},
  nextClipStart?: number,
): { sourceClip: RegisteredMockObject; track: RegisteredMockObject } {
  const { sourceClip, track } = setupSingleArrangementClip(0);

  makeResizable(sourceClip, props, nextClipStart);

  return { sourceClip, track };
}

/**
 * Put a 1-bar clip at bar 2 of track 0, right after clip 789.
 * @param track - Track 0's mock, whose clip list gets the neighbour
 * @returns The neighbour's mock
 */
export function registerNeighbourClip(
  track: RegisteredMockObject,
): RegisteredMockObject {
  const neighbour = registerMockObject("neighbour", {
    path: livePath.track(0).arrangementClip(1),
    type: "Clip",
    properties: { start_time: 4, end_time: 8 },
  });

  track.properties.arrangement_clips = children("789", "neighbour");

  return neighbour;
}
