// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

/** A C3 at beat 0, as Live reports it back. */
export const NOTE = {
  pitch: 60,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

/** The entry detail for exactly one dropped duplicate. */
export const DROPPED = "dropped 1 duplicate note at the same pitch and start";

/**
 * Register the update-clip mocks with clip 123 as a 4-beat MIDI clip.
 * @returns The registered clip mocks
 */
export function setupDuplicateNoteMocks(): UpdateClipMocks {
  const mocks = setupUpdateClipMocks();

  setupMidiClipMock(mocks.clip123, { length: 4 });

  return mocks;
}
