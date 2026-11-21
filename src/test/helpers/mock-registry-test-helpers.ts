// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: OpenAI (GPT-5), Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { type PathLike, livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

type CallOverride = (method: string, ...args: unknown[]) => unknown;

export const USE_CALL_FALLBACK = Symbol("USE_CALL_FALLBACK");

/**
 * Look up a registered mock object by path and fail with a clear assertion if missing.
 * @param path - Live API path (e.g., "live_set tracks 0")
 * @returns Registered mock object
 */
export function requireMockObject(path: PathLike): RegisteredMockObject {
  const mock = lookupMockObject(undefined, path);

  expect(mock).toBeDefined();

  if (mock == null) {
    throw new Error(`Expected mock object at path "${String(path)}"`);
  }

  return mock;
}

/**
 * Look up a track mock by track index.
 * @param trackIndex - Track index
 * @returns Registered track mock
 */
export function requireMockTrack(trackIndex: number): RegisteredMockObject {
  return requireMockObject(livePath.track(trackIndex));
}

/**
 * Create note-tracking call method implementations for a clip mock.
 * Tracks notes added via add_new_notes and returns them for get_notes_extended,
 * so getClipNoteCount() reads back the notes that were actually written.
 * @returns Method implementations for registerMockObject's `methods` option
 */
export function createNoteTrackingMethods(): Record<
  string,
  (...args: unknown[]) => unknown
> {
  let notes: unknown[] = [];

  return {
    add_new_notes: (arg: unknown) => {
      const data = arg as { notes?: unknown[] } | null | undefined;

      notes = data?.notes ?? [];
    },
    get_notes_extended: () => JSON.stringify({ notes }),
  };
}

/**
 * Override specific call methods while preserving default call behavior for others.
 * Return `USE_CALL_FALLBACK` from override to defer to the existing mock implementation.
 * @param mock - Registered mock object to override
 * @param override - Method override callback
 */
export function overrideCall(
  mock: RegisteredMockObject,
  override: CallOverride,
): void {
  const fallbackCall = mock.call.getMockImplementation();

  mock.call.mockImplementation((method: string, ...args: unknown[]) => {
    const overrideResult = override(method, ...args);

    if (overrideResult !== USE_CALL_FALLBACK) {
      return overrideResult;
    }

    if (fallbackCall != null) {
      return fallbackCall.call(mock, method, ...args);
    }

    return null;
  });
}

/** What a MIDI clip's `midi_clip_type` read looks like on each Live. */
export type MidiClipEra = "step-sequencer" | "notes" | "live-12";

/**
 * Make a registered MIDI clip answer `midi_clip_type` the way Live does: the
 * list [1] on a Live 13 step sequencer clip, [0] on a Live 13 notes clip, and a
 * bare 1 (not a list) on Live 12, which has no such property. Wraps whatever
 * `get` the clip already has, so call it after the clip's own setup. Also
 * registers the Live version that goes with the era, since the property is
 * only read on Live 13.
 * @param clip - Registered clip mock
 * @param era - Which answer to give
 * @param liveVersion - The version Live reports, when the era's own won't do
 */
export function setMidiClipType(
  clip: RegisteredMockObject,
  era: MidiClipEra,
  liveVersion = era === "live-12" ? "12.4.15" : "13.0",
): void {
  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => liveVersion },
  });

  const inner = clip.get.getMockImplementation();

  clip.get.mockImplementation((prop: string) => {
    if (prop !== "midi_clip_type") {
      return inner?.(prop) ?? [];
    }

    return era === "live-12" ? 1 : [era === "step-sequencer" ? 1 : 0];
  });
}

/** Every call that reaches a clip's notes. */
const NOTES_API_METHODS = new Set([
  "get_notes_extended",
  "add_new_notes",
  "remove_notes_extended",
  "apply_note_modifications",
  "quantize",
  "quantize_pitch",
  "duplicate_loop",
]);

/**
 * Assert that nothing touched a clip's notes API.
 * @param clip - Registered clip mock
 */
export function expectNoNotesApiCalls(clip: RegisteredMockObject): void {
  const touched = clip.call.mock.calls
    .map(([method]) => method as string)
    .filter((method) => NOTES_API_METHODS.has(method));

  expect(touched).toStrictEqual([]);
}
