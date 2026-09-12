// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Mocks the take-lane duplicate suites share. */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

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
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      length: 4,
      start_time: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      ...extraProps,
    },
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
    properties: {
      is_midi_clip: midi ? 1 : 0,
      is_arrangement_clip: 1,
      length: 4,
      start_time: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      ...options.extraProps,
    },
    methods: {
      get_notes_extended:
        options.getNotesExtended ?? (() => JSON.stringify({ notes })),
    },
  });
}
