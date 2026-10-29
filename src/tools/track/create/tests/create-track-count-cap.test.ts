// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import { registerCreateTrackLiveSet } from "./create-track-test-helpers.ts";
import { createTrack } from "../create-track.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
}));

const TOO_MANY = (count: number): string =>
  `creating ${count} tracks exceeds the maximum allowed (${MAX_AUTO_CREATED_TRACKS})`;

describe("createTrack count cap", () => {
  beforeEach(() => {
    registerCreateTrackLiveSet(() => ["id", "return_track"]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["appending", {}],
    ["inserting", { trackIndex: 1 }],
    ["a path", { path: "t+" }],
    ["a return track", { type: "return" as const }],
  ])("refuses a huge count when %s without building it", (_, args) => {
    const from = vi.spyOn(Array, "from");

    expect(() => createTrack({ ...args, count: 1_000_000_000 })).toThrow(
      TOO_MANY(1_000_000_000),
    );
    expect(from).not.toHaveBeenCalledWith(
      { length: 1_000_000_000 },
      expect.anything(),
    );
  });

  it("refuses one past the cap with the same message", () => {
    expect(() => createTrack({ count: MAX_AUTO_CREATED_TRACKS + 1 })).toThrow(
      TOO_MANY(MAX_AUTO_CREATED_TRACKS + 1),
    );
  });

  it("refuses a path list longer than the cap", () => {
    const path = Array.from(
      { length: MAX_AUTO_CREATED_TRACKS + 1 },
      () => "t+",
    ).join(",");

    expect(() => createTrack({ path })).toThrow(
      TOO_MANY(MAX_AUTO_CREATED_TRACKS + 1),
    );
  });

  it("still creates exactly the cap", () => {
    registerMockObject("midi_track_-1", {});

    expect(createTrack({ count: MAX_AUTO_CREATED_TRACKS })).toHaveLength(
      MAX_AUTO_CREATED_TRACKS,
    );
  });
});
