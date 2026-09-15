// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readTrack } from "../read-track.ts";

/** Register two bare MIDI tracks. */
function setupTracks(): void {
  for (const index of [0, 1]) {
    registerMockObject(`track${index}`, {
      path: livePath.track(index),
      type: "Track",
      properties: {
        has_midi_input: 1,
        name: `Track ${index}`,
        can_be_armed: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
        clip_slots: [],
        arrangement_clips: [],
        devices: [],
      },
    });
  }
}

const track0 = {
  id: "track0",
  path: "t0",
  type: "midi",
  name: "Track 0",
  sessionClipCount: 0,
  arrangementClipCount: 0,
  deviceCount: 0,
};
const track1 = { ...track0, id: "track1", path: "t1", name: "Track 1" };

describe("readTrack over a list of targets", () => {
  beforeEach(() => {
    setupTracks();
    mockNonExistentObjects();
  });

  it("reads one track per id, in the order named", () => {
    expect(readTrack({ id: "track1,track0" })).toStrictEqual([track1, track0]);
  });

  it("reads one track per path, in the order named", () => {
    expect(readTrack({ path: "t1, t0" })).toStrictEqual([track1, track0]);
  });

  it("reads ids and paths together, ids first", () => {
    expect(readTrack({ id: "track1", path: "t0" })).toStrictEqual([
      track1,
      track0,
    ]);
  });

  it("takes the list from the ids and paths aliases", () => {
    expect(readTrack({ ids: "track0", paths: "t1" })).toStrictEqual([
      track0,
      track1,
    ]);
  });

  it("keeps a slot for a target it can't read, and says why", () => {
    expect(readTrack({ path: "t0,t9" })).toStrictEqual([
      track0,
      { path: "t9", ok: false, reason: 'nothing at path "t9"' },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("unwraps a single target", () => {
    expect(readTrack({ path: "t0" })).toStrictEqual(track0);
  });

  it("still throws when the only target names nothing", () => {
    expect(() => readTrack({ path: "t9" })).toThrow('nothing at path "t9"');
  });

  it("refuses a list with an empty entry", () => {
    expect(() => readTrack({ path: "t0,,t1" })).toThrow(
      'invalid path "t0,,t1" - it has an empty entry',
    );
  });

  // A location param names one track on its own, so beside a list every entry
  // would read that track, or be refused for naming two places at once.
  it("still reads the track trackIndex names", () => {
    expect(readTrack({ trackIndex: 1 })).toStrictEqual(track1);
  });

  it("still reads the main track trackType names", () => {
    registerMockObject("main", {
      path: livePath.masterTrack(),
      type: "Track",
      properties: {
        has_midi_input: 0,
        name: "Main",
        can_be_armed: 0,
        clip_slots: [],
        arrangement_clips: [],
        devices: [],
      },
    });

    expect(readTrack({ trackType: "master" })).toStrictEqual({
      id: "main",
      path: "mt",
      name: "Main",
      sessionClipCount: 0,
      arrangementClipCount: 0,
      deviceCount: 0,
    });
  });

  it("refuses trackIndex beside a list", () => {
    expect(() => readTrack({ path: "t0,t1", trackIndex: 0 })).toThrow(
      "trackIndex names one track, but id and path name 2. " +
        "Name every track with id or path, or drop trackIndex.",
    );
  });

  it("refuses trackType beside a list", () => {
    expect(() => readTrack({ path: "t0,t1", trackType: "master" })).toThrow(
      "trackType names one track, but id and path name 2",
    );
  });
});
