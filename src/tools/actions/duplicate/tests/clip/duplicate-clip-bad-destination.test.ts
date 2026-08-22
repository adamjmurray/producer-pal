// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerClipSlot,
  registerMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

// A toPath entry that names nowhere must cost only its own copy. Before this,
// the first entry's copy was made and then thrown away with the whole call, so
// the model never learned it existed and made it a second time on retry.
describe("duplicate clip - a toPath entry that names nowhere", () => {
  it("keeps the session copy that landed when a later slot is missing", async () => {
    mockNonExistentObjects();

    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { has_midi_input: 1 },
    });
    registerClipSlot(0, 0, true);
    registerClipSlot(0, 1, false);
    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });

    // Scene 9 doesn't exist, so its slot doesn't either.
    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/s1,t0/s9",
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/1/clip",
      path: "t0/s1",
    });
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("was not duplicated: no clip slot at t0/s9"),
    );
  });

  it("keeps the arrangement copy that landed when a later track is missing", async () => {
    mockNonExistentObjects();

    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerMockObject("live_set", { path: livePath.liveSet });

    const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });

    registerArrangementClip(2, 0, 8);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t2,t99",
    });

    expect(track2.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      8,
    );
    expect(result).toStrictEqual({
      id: livePath.track(2).arrangementClip(0),
      path: "t2",
      arrangementStart: "3|1",
    });
    expect(outlet).toHaveBeenCalledWith(
      1,
      'duplicate: no track at toPath "t99"',
    );
  });

  it("copies nowhere, without failing, when every track is missing", async () => {
    mockNonExistentObjects();

    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerMockObject("live_set", { path: livePath.liveSet });

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t98,t99",
    });

    expect(result).toStrictEqual([]);
  });
});

// A destination the clip can't be copied to still takes its turn in a
// comma-separated name/color list. Renumbering around it named the surviving
// copies wrong, and shrinking the count could stop a color list from splitting
// at all.
describe("duplicate clip - a toPath entry the clip can't go to", () => {
  /** Register the MIDI source clip and the live_set. */
  function registerMidiSource(): void {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerMockObject("live_set", { path: livePath.liveSet });
  }

  /**
   * Register a destination track and the clip a copy to it would land on.
   * @param trackIndex - Track index
   * @param hasMidiInput - Whether the track takes MIDI input
   * @returns The arrangement clip mock
   */
  function registerDestTrack(trackIndex: number, hasMidiInput: boolean) {
    registerTrackWithArrangementDup(trackIndex, {
      has_midi_input: hasMidiInput ? 1 : 0,
    });

    return registerArrangementClip(trackIndex, 0, 8);
  }

  it("gives the copies that land the names they were asked for", async () => {
    registerMidiSource();
    registerDestTrack(1, true);
    registerDestTrack(2, false);

    const clip3 = registerDestTrack(3, true);

    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t1,t2,t3",
      name: "A,B,C",
    });

    expect(clip3.set).toHaveBeenCalledWith("name", "C");
  });

  it("still splits a two-copy color list when one destination drops out", async () => {
    registerMidiSource();

    const clip1 = registerDestTrack(1, true);

    registerDestTrack(2, false);

    // Counting only the survivor left one copy, so the list stopped splitting
    // and "#ff0000,#00ff00" reached Live as a single color — a hard tool
    // failure, with the first copy already made.
    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t1,t2",
      name: "Verse,Chorus",
      color: "#ff0000,#00ff00",
    });

    expect(clip1.set).toHaveBeenCalledWith("name", "Verse");
    expect(clip1.set).toHaveBeenCalledWith("color", 0xff0000);
  });

  it("still splits the list when a clip slot shares an arrangement toPath", async () => {
    registerMidiSource();

    const clip2 = registerDestTrack(2, true);

    // arrangementStart makes this an arrangement duplicate, so the clip slot
    // names nowhere the copy can go. It was removed rather than skipped, which
    // collapsed the count the same way — Live got "#ff0000,#00ff00" as one
    // color and the call failed with the copy on t2 already made.
    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "3|1",
      toPath: "t1/s0,t2",
      name: "Verse,Chorus",
      color: "#ff0000,#00ff00",
    });

    expect(clip2.set).toHaveBeenCalledWith("name", "Chorus");
    expect(clip2.set).toHaveBeenCalledWith("color", 0x00ff00);
  });
});
