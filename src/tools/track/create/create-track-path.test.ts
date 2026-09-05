// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerCreateTrackLiveSet } from "./create-track-test-helpers.ts";
import { createTrack } from "./create-track.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  log: vi.fn(),
  warn: vi.fn(),
}));

describe("createTrack by path", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerCreateTrackLiveSet(() => ["id", "return_track_0"]);
  });

  it("appends with t+", () => {
    registerMockObject("midi_track_-1", {});

    expect(createTrack({ path: "t+", name: "Appended" })).toStrictEqual({
      id: "midi_track_-1",
      path: "t2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", -1);
  });

  it("inserts at the index a path names", () => {
    registerMockObject("audio_track_1", {});

    expect(
      createTrack({ path: "t1", type: "audio", name: "Inserted" }),
    ).toStrictEqual({
      id: "audio_track_1",
      path: "t1",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_audio_track", 1);
  });

  // The path settles both the Live call and the position, so `type` has
  // nothing left to say about a return track.
  it("adds a return track with rt+", () => {
    registerMockObject("return_track_0", {});

    expect(createTrack({ path: "rt+", name: "Reverb" })).toStrictEqual({
      id: "return_track_0",
      path: "rt2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_return_track");
  });

  it("refuses a return track at an index, since Live appends them", () => {
    expect(() => createTrack({ path: "rt1" })).toThrow(
      'invalid path "rt1" - Live adds return tracks at the end, so they have no index; use "rt+"',
    );
  });

  it("refuses a path that names no place for a track", () => {
    expect(() => createTrack({ path: "s0" })).toThrow(
      'invalid path "s0" - it names no place for a track',
    );
  });

  it("refuses a path sent with trackIndex", () => {
    expect(() => createTrack({ path: "t+", trackIndex: 1 })).toThrow(
      "path says where the track goes - don't send trackIndex with it",
    );
  });

  it("refuses a regular-track path asked for as a return", () => {
    expect(() => createTrack({ path: "t+", type: "return" })).toThrow(
      'invalid path "t+" - it names a regular track, but type is "return"',
    );
  });

  // Still accepted so a caller mid-migration keeps working, but told what
  // replaced it.
  it("warns when a return track is asked for by type", () => {
    registerMockObject("return_track_0", {});

    createTrack({ type: "return", name: "Old Way" });

    expect(console.warn).toHaveBeenCalledWith(
      'type "return" is deprecated and will be removed; use path "rt+" instead',
    );
  });
});
