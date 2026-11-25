// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

/** C Major's intervals, as Live reports them. */
export const C_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

/** A Live whose clips have a scale of their own. */
export const LIVE_WITH_CLIP_SCALE = "12.4.15";

/** The last Live whose clips have none. */
export const LIVE_WITHOUT_CLIP_SCALE = "12.4.14";

/** D Dorian, as a clip holds it. */
export const DORIAN = { scale_mode: 1, root_note: 2, scale_name: "Dorian" };

/** The scale properties of the Live Set or a clip. */
export interface ScaleProps {
  scale_mode: number;
  root_note: number;
  scale_name: string;
  scale_intervals: number[];
}

/**
 * Register the Live Set with a scale.
 * @param props - The scale properties it holds; a scale off by default
 * @param extra - Other properties, like its meter
 */
export function registerSongScale(
  props: Partial<ScaleProps> = {},
  extra: Record<string, unknown> = {},
): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      scale_mode: 0,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
      ...props,
      ...extra,
    },
  });
}

/**
 * Register Live itself at a version, and count what asks it.
 * @param version - What `get_version_string` answers
 * @returns The number of times it was asked, read when called
 */
export function registerLiveVersion(version: string): () => number {
  let asked = 0;

  registerMockObject("live_app", {
    path: "live_app",
    methods: {
      get_version_string: () => {
        asked += 1;

        return version;
      },
    },
  });

  return () => asked;
}

/**
 * The scale properties a clip was written, in order.
 * @param clip - The registered clip
 * @returns [property, value] pairs for the scale properties
 */
export function scaleWrites(
  clip: RegisteredMockObject | undefined,
): unknown[][] {
  return (clip?.set.mock.calls ?? []).filter(([property]) =>
    ["root_note", "scale_name", "scale_mode"].includes(property as string),
  );
}

/**
 * Assert a clip was written D Dorian.
 * @param clip - The registered clip
 */
export function expectDorianWritten(
  clip: RegisteredMockObject | undefined,
): void {
  expect(clip?.set).toHaveBeenCalledWith("root_note", 2);
  expect(clip?.set).toHaveBeenCalledWith("scale_name", "Dorian");
  expect(clip?.set).toHaveBeenCalledWith("scale_mode", 1);
}

/**
 * A Live Set or clip mock that stores what is written to it and reads it back.
 * @returns The mock
 */
export function mockScaleTarget(): LiveAPI {
  const stored: Record<string, unknown> = {};

  return {
    set: vi.fn((property: string, value: unknown) => {
      stored[property] = value;
    }),
    getProperty: vi.fn((property: string) => stored[property]),
  } as unknown as LiveAPI;
}
