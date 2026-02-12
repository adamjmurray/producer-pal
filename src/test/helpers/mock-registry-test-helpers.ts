// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: OpenAI (GPT-5)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  type MockObjectHandle,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";

type CallOverride = (method: string, ...args: unknown[]) => unknown;

export const useCallFallback = Symbol("use-call-fallback");

/**
 * Look up a registered mock object by path and fail with a clear assertion if missing.
 * @param path - Live API path (e.g., "live_set tracks 0")
 * @returns Registered mock handle
 */
export function requireMockHandle(path: string): MockObjectHandle {
  const handle = lookupMockObject(undefined, path);

  expect(handle).toBeDefined();

  if (handle == null) {
    throw new Error(`Expected handle at path "${path}"`);
  }

  return handle;
}

/**
 * Look up a track mock handle by track index.
 * @param trackIndex - Track index
 * @returns Registered track handle
 */
export function requireTrackHandle(trackIndex: number): MockObjectHandle {
  return requireMockHandle(`live_set tracks ${trackIndex}`);
}

/**
 * Override specific call methods while preserving default call behavior for others.
 * Return `useCallFallback` from override to defer to the existing mock implementation.
 * @param handle - Mock object handle to override
 * @param override - Method override callback
 */
export function composeCallOverride(
  handle: MockObjectHandle,
  override: CallOverride,
): void {
  const fallbackCall = handle.call.getMockImplementation();

  handle.call.mockImplementation((method: string, ...args: unknown[]) => {
    const overrideResult = override(method, ...args);

    if (overrideResult !== useCallFallback) {
      return overrideResult;
    }

    if (fallbackCall != null) {
      return fallbackCall.call(handle, method, ...args);
    }

    return null;
  });
}
