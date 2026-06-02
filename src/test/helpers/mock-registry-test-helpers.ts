// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: OpenAI (GPT-5), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { type PathLike, livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
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
 * so getPlayableNoteCount() reads back the notes that were actually written.
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
