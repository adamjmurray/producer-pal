// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

/**
 * One 4-bar arrangement MIDI clip on its own track, so a move can't collide
 * with a sibling.
 * @param trackIndex - The track it sits on
 * @returns The track mock, which records the move calls
 */
function setupClipOnTrack(trackIndex: number): RegisteredMockObject {
  registerMockObject(clipId(trackIndex), {
    path: livePath.track(trackIndex).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0,
      end_time: 16,
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    },
  });

  return registerMockObject(`track-${trackIndex}`, {
    path: livePath.track(trackIndex),
    type: "Track",
    properties: { track_index: trackIndex },
    methods: {
      duplicate_clip_to_arrangement: () => `id moved-${trackIndex}`,
      create_midi_clip: () => `id temp-${trackIndex}`,
      delete_clip: () => null,
    },
  });
}

/**
 * Every position a track took a move at, in call order.
 * @param track - The track mock
 * @returns The target positions in beats
 */
function movesTo(track: RegisteredMockObject): number[] {
  return vi
    .mocked(track.call)
    .mock.calls.filter(([method]) => method === "duplicate_clip_to_arrangement")
    .map((call) => call[2] as number);
}

/**
 * Where a track's move landed, or null when nothing moved.
 * @param track - The track mock
 * @returns The target position in beats
 */
function movedTo(track: RegisteredMockObject): number | null {
  return movesTo(track)[0] ?? null;
}

/**
 * The clip id for a track. Not "0": Live reads id 0 as no object at all.
 * @param trackIndex - The track the clip sits on
 * @returns The clip id
 */
function clipId(trackIndex: number): string {
  return `10${trackIndex}`;
}

describe("updateClip - arrangement params per clip", () => {
  let tracks: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    tracks = [0, 1, 2].map(setupClipOnTrack);
  });

  it("moves every clip when one position is given", async () => {
    await updateClip({ id: "100,101,102", arrangementStart: "5|1" });

    expect(tracks.map(movedTo)).toStrictEqual([16, 16, 16]);
  });

  it("gives each clip its own position", async () => {
    await updateClip({ id: "100,101,102", arrangementStart: "5|1,9|1,13|1" });

    expect(tracks.map(movedTo)).toStrictEqual([16, 32, 48]);
  });

  // It never cycled — the third clip stayed put. Now the uneven call is refused
  // outright, so the third clip's fate never comes up.
  it("refuses a short position list", async () => {
    await expect(
      updateClip({ id: "100,101,102", arrangementStart: "5|1,9|1" }),
    ).rejects.toThrow(
      "id names 3 entries but arrangementStart names 2 entries.",
    );

    expect(tracks.map(movedTo)).toStrictEqual([null, null, null]);
  });

  it("resizes every clip when one length is given", async () => {
    await updateClip({ id: "100,101", arrangementLength: "2bar" });

    for (const track of [tracks[0], tracks[1]]) {
      expect(track?.call).toHaveBeenCalledWith("create_midi_clip", 8, 8);
    }
  });

  it("gives each clip its own length", async () => {
    await updateClip({ id: "100,101", arrangementLength: "2bar,1bar" });

    expect(tracks[0]?.call).toHaveBeenCalledWith("create_midi_clip", 8, 8);
    expect(tracks[1]?.call).toHaveBeenCalledWith("create_midi_clip", 4, 12);
  });

  it("refuses a short length list", async () => {
    await expect(
      updateClip({ id: "100,101,102", arrangementLength: "2bar,1bar" }),
    ).rejects.toThrow(
      "id names 3 entries but arrangementLength names 2 entries.",
    );

    for (const track of tracks) {
      expect(track.call).not.toHaveBeenCalledWith(
        "create_midi_clip",
        expect.anything(),
        expect.anything(),
      );
    }
  });
});

describe("updateClip - a toPath coordinate", () => {
  let tracks: RegisteredMockObject[];

  beforeEach(() => {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    // Track 3 is spare, so a move onto it never lands where its own clip
    // already is — a clip moved onto its own spot goes via a holding area.
    tracks = [0, 1, 2, 3].map(setupClipOnTrack);
  });

  it("moves the clip to the lane and position the path names", async () => {
    await updateClip({ id: "100", toPath: "t1[5|1]" });

    expect(movedTo(tracks[1] as RegisteredMockObject)).toBe(16);
  });

  // The lane alone: the clip keeps the start it already has.
  it("keeps the clip's position when the path names only a lane", async () => {
    await updateClip({ id: "100", toPath: "t1" });

    expect(movedTo(tracks[1] as RegisteredMockObject)).toBe(0);
  });

  // The position alone: the clip keeps the lane it is already on.
  it("keeps the clip's lane when the path names only a position", async () => {
    await updateClip({ id: "100", toPath: "[5|1]" });

    expect(movedTo(tracks[0] as RegisteredMockObject)).toBe(16);
  });

  // One bare coordinate covers every clip, exactly as the arrangementStart it
  // replaces does: each clip keeps its own lane, so the landing spots differ
  // and nothing lands on top of anything. A lane still pairs 1:1.
  it("broadcasts a lone bare coordinate across every clip", async () => {
    await updateClip({ id: "100,101", toPath: "[5|1]" });

    expect(movedTo(tracks[0] as RegisteredMockObject)).toBe(16);
    expect(movedTo(tracks[1] as RegisteredMockObject)).toBe(16);
  });

  // The shape a lowered toPath can't express: rewriting "[9|1]" as an empty
  // lane makes the middle entry name nothing, and a target list with a hole in
  // it is refused.
  /** Re-seed the clips with a "Chorus" locator at beat 32 in the Set. */
  function seedChorusLocator(): void {
    setupCuePointMocksRegistry({
      cuePoints: [{ id: "cue1", time: 32, name: "Chorus" }],
    });
    tracks = [0, 1, 2, 3].map(setupClipOnTrack);
  }

  it("reads a bare coordinate in the middle of a list", async () => {
    await updateClip({ id: "100,101,102", toPath: "t3[5|1],[9|1],t3" });

    expect(movesTo(tracks[3] as RegisteredMockObject)).toStrictEqual([16, 0]);
    expect(movesTo(tracks[1] as RegisteredMockObject)).toStrictEqual([32]);
  });

  it("resolves a locator inside the coordinate", async () => {
    seedChorusLocator();

    await updateClip({ id: "100", toPath: "t2[loc:Chorus]" });

    expect(movedTo(tracks[2] as RegisteredMockObject)).toBe(32);
  });

  // An entry that doesn't parse costs its own move and keeps its turn, so the
  // locator beside it still resolves against the right clip.
  it("resolves a locator beside an entry that won't parse", async () => {
    seedChorusLocator();

    await updateClip({ id: "100,101", toPath: "tX,t2[loc:Chorus]" });

    expect(movedTo(tracks[2] as RegisteredMockObject)).toBe(32);
    expect(movedTo(tracks[0] as RegisteredMockObject)).toBeNull();
  });

  // A clip goes on a lane that exists; ppal-update-track is what adds one. The
  // retired "l=" named the lane an "l+" before it appended, and never shipped.
  // create-clip and duplicate throw for both, because a lone destination is all
  // they have; here each one is the entry's own miss.
  it("reports the retired l= and an l+ on the clip's entry", async () => {
    const result = await updateClip({
      id: "100,101",
      toPath: "t2/l=[5|1],t3/l+[5|1]",
    });

    expect(result).toStrictEqual([
      {
        id: "100",
        ok: false,
        detail:
          'not moved: invalid toPath "t2/l=" - "l=" is not a device, chain, ' +
          'or drum pad; expected "d<index>", "c<index>", "rc<index>", or "p<note>"',
      },
      {
        id: "101",
        ok: false,
        detail:
          'not moved: invalid toPath "t3/l+[5|1]" - "l+" takes no song ' +
          'position; name the lane by index, as "t<track>/l<lane>"',
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
    expect(tracks.map(movedTo)).toStrictEqual([null, null, null, null]);
  });

  it("throws for a lone clip sent to the retired l=", async () => {
    await expect(
      updateClip({ id: "100", toPath: "t2/l=[5|1]" }),
    ).rejects.toThrow('"l=" is not a device, chain, or drum pad');
  });

  // A name the Set doesn't have is that clip's own miss, so it rides back on
  // the clip's entry and the batch keeps going. It used to warn "clip not
  // moved" and drop every destination in the call.
  it("reports a locator the Set doesn't have on the clip's entry", async () => {
    seedChorusLocator();

    const result = await updateClip({
      id: "100,101",
      toPath: "t2[loc:Nope],t3[loc:Chorus]",
    });

    expect(result).toStrictEqual([
      {
        id: "100",
        ok: false,
        detail: 'not moved: no locator found with name "Nope" for toPath',
      },
      expect.objectContaining({ id: "moved-3" }),
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
    expect(movedTo(tracks[3] as RegisteredMockObject)).toBe(32);
    expect(movedTo(tracks[2] as RegisteredMockObject)).toBeNull();
  });

  // One target has no list to hold a place in, so the reason goes back as the
  // error it would have been.
  it("throws for a lone clip whose locator the Set doesn't have", async () => {
    setupCuePointMocksRegistry({ cuePoints: [] });
    tracks = [0, 1, 2, 3].map(setupClipOnTrack);

    await expect(
      updateClip({ id: "100", toPath: "t2[loc:Nope]" }),
    ).rejects.toThrow(
      'not moved: no locator found with name "Nope" for toPath',
    );

    expect(tracks.map(movedTo)).toStrictEqual([null, null, null, null]);
  });

  // Two spellings of one position: honoring either is the silent wrong-target
  // bug the grammar exists to prevent.
  it("refuses a coordinate beside arrangementStart, naming both", async () => {
    await expect(
      updateClip({ id: "100", toPath: "t1[5|1]", arrangementStart: "9|1" }),
    ).rejects.toThrow(
      'toPath "t1[5|1]" and arrangementStart both name a ' +
        "song position; use one",
    );

    expect(tracks.map(movedTo)).toStrictEqual([null, null, null, null]);
  });
});
