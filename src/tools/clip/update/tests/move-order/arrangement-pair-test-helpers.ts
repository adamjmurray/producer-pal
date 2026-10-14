// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  requireMockObject,
  requireMockTrack,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  setupArrangementClipPath,
  setupMockProperties,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

/**
 * Two 4-bar arrangement clips on track 0, 100 and 101, whose moves land as
 * copy-1 and copy-2.
 * @returns The track mock
 */
export function setUpArrangementPair(): RegisteredMockObject {
  const clips = setupArrangementClipPath(0, ["100", "copy-1", "copy-2"]);

  // The call's second clip: setupArrangementClipPath treats every id after the
  // first as a copy the track will make.
  clips.set(
    "101",
    registerMockObject("101", {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
    }),
  );

  for (const [id, start] of [
    ["100", 0],
    ["101", 32],
    ["copy-1", 64],
    ["copy-2", 96],
  ] as const) {
    setupMockProperties(clips.get(id) as RegisteredMockObject, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: start,
      end_time: start + 16,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex: 0,
    });
  }

  setupMockProperties(requireMockObject("live_set"), {
    tracks: ["id", 0],
    signature_numerator: 4,
    signature_denominator: 4,
  });

  return requireMockTrack(0);
}
