// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import { createClip } from "../../create-clip.ts";
import { processClipIteration } from "../../helpers/create-clip-helpers.ts";
import {
  setupArrangementClipMocks,
  setupAudioArrangementClipMocks,
} from "../create-clip-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Call processClipIteration for a single arrangement position with sensible
 * defaults, overriding only the fields a test cares about.
 * @param opts - Overrides for the iteration
 * @param opts.sampleFile - Audio file path (audio clip) or null for MIDI
 * @param opts.clipName - Clip name to apply
 * @param opts.color - Clip color to apply
 * @returns The clip result object from processClipIteration
 */
function callArrangementIteration(opts: {
  sampleFile?: string | null;
  clipName?: string | undefined;
  color?: string | null;
}): object {
  const liveSet = LiveAPI.from(livePath.liveSet);

  return processClipIteration(
    "arrangement", // view
    0, // trackIndex
    null, // sceneIndex
    0, // arrangementStartBeats
    "1|1", // arrangementStart
    4, // clipLength
    liveSet,
    null, // startBeats
    null, // endBeats
    null, // firstStartBeats
    null, // looping
    opts.clipName, // clipName
    opts.color ?? null, // color
    4, // timeSigNumerator
    4, // timeSigDenominator
    null, // notationString
    [], // notes
    null, // length
    opts.sampleFile ?? null, // sampleFile
    undefined, // transformedCount
    null, // takeLane
  );
}

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", async () => {
    const { track, clip } = setupArrangementClipMocks();

    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "3|1",
      notes: "C3 D3 E3 1|1",
      name: "Arrangement Clip",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4); // Length based on notes (1 bar in 4/4)
    expect(clip.set).toHaveBeenCalledWith("name", "Arrangement Clip");

    expect(result).toStrictEqual({
      id: "arrangement_clip",
      path: "t0",
      arrangementStart: "3|1",
      noteCount: 3,
      length: "1bar",
    });
  });

  it("rejects a 0-indexed arrangementStart with the 1-indexing steer", async () => {
    const { track } = setupArrangementClipMocks();

    // A 0-indexed/zero-bar position is a hard error, not a silent pre-origin
    // beat. Also covers the per-item check in a comma-separated list.
    await expect(
      createClip({ trackIndex: 0, arrangementStart: "1|0", notes: "C3 1|1" }),
    ).rejects.toThrow(/1-indexed/);
    await expect(
      createClip({
        trackIndex: 0,
        arrangementStart: "3|1,0|1",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow(/1-indexed/);
    // Regression: every position is checked before the first clip is made, so
    // the bar-3 clip doesn't get left behind by the bar-0 error — which is all
    // the caller gets back, and it names no clip.
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it("should create arrangement clips at specified positions", async () => {
    const { track } = setupArrangementClipMocks();

    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "3|1,4|1,5|1", // Three explicit positions
      name: "Sequence",
      notes: "C3 1|1 D3 1|2",
    });

    // Clips should be created with exact length (4 beats = 1 bar in 4/4) at specified positions
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4); // 3|1 = 8 beats
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 12, 4); // 4|1 = 12 beats
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 4); // 5|1 = 16 beats

    expect(result).toStrictEqual([
      {
        id: "arrangement_clip",
        path: "t0",
        arrangementStart: "3|1",
        noteCount: 2,
        length: "1bar",
      },
      {
        id: "arrangement_clip",
        path: "t0",
        arrangementStart: "4|1",
        noteCount: 2,
        length: "1bar",
      },
      {
        id: "arrangement_clip",
        path: "t0",
        arrangementStart: "5|1",
        noteCount: 2,
        length: "1bar",
      },
    ]);
  });

  it("should throw error when track doesn't exist", async () => {
    mockNonExistentObjects();

    await expect(
      createClip({
        trackIndex: 99,
        arrangementStart: "3|1",
      }),
    ).rejects.toThrow("createClip failed: track 99 does not exist");
  });

  it("should emit warning and return empty array when arrangement clip creation fails", async () => {
    mockNonExistentObjects();

    registerMockObject("track-0", {
      path: livePath.track(0),
      methods: {
        create_midi_clip: vi.fn(() => ["id", "missing-arrangement-clip"]),
      },
    });

    // Runtime errors during clip creation are now warnings, not fatal errors
    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C4 1|1",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);
  });

  it("should throw when arrangementStart names no track", async () => {
    await expect(
      createClip({
        arrangementStart: "1|1",
        notes: "C4 1|1",
      }),
    ).rejects.toThrow("createClip failed: arrangementStart needs a track");
  });

  // A real position beside a slot-only path is refused; one that names nothing
  // used to vanish instead, so the same call read as "a clip slot was all I
  // ever asked for".
  it("warns when arrangementStart names no position", async () => {
    setupArrangementClipMocks();

    await createClip({
      path: "t0/s1",
      arrangementStart: ",  ,",
      notes: "C4 1|1",
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('arrangementStart ",  ," names nothing'),
    );
  });

  it("cycles clipseq() by clip.index across arrangement positions", async () => {
    const { track, clip } = setupArrangementClipMocks();

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1,2|1,3|1",
      notes: "C3 1|1",
      transforms: "velocity = clipseq(11, 22, 33)",
    });

    // All three positions resolve to the same mock clip, so inspect each
    // add_new_notes payload: the velocity cycles by clip.index per position.
    const addNotesPayloads = clip.call.mock.calls
      .filter((call: unknown[]) => call[0] === "add_new_notes")
      .map((call: unknown[]) => call[1]);

    expect(addNotesPayloads).toStrictEqual([
      { notes: [createNote({ velocity: 11 })] },
      { notes: [createNote({ velocity: 22 })] },
      { notes: [createNote({ velocity: 33 })] },
    ]);

    // create_midi_clip still receives the per-position arrangement start
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
  });

  it("distributes comma-separated names and colors across arrangement positions", async () => {
    // Two positions with two names and two colors. The count is
    // clipSlots.length + arrangementStarts.length (0 + 2 = 2). The `+` → `-`,
    // the `name ?? undefined` / `color ?? undefined` → `&&`, and the returned
    // `{ parsedNames, parsedColors }` → `{}` mutants all collapse the per-position
    // distribution so the second name/color never lands.
    const { clip } = setupArrangementClipMocks();

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1,2|1",
      name: "Alpha,Beta",
      color: "#FF0000,#00FF00",
    });

    expect(clip.set).toHaveBeenCalledWith("name", "Alpha");
    expect(clip.set).toHaveBeenCalledWith("name", "Beta");
    expect(clip.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
    expect(clip.set).toHaveBeenCalledWith("color", 65280); // #00FF00
  });

  it("names the item when more names than positions are provided", async () => {
    // The blanked item-noun mutant would drop "clips" from the warning.
    setupArrangementClipMocks();

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1,2|1",
      name: "A,B,C",
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("name: 3 names for 2 clips"),
    );
  });

  it("creates the arrangement clip on the requested track (not defaulting to 0)", async () => {
    // The `trackIndex ?? 0` → `trackIndex && 0` mutant would coerce any track
    // index to 0, creating the clip on the wrong track.
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    const track2 = registerMockObject("track-2", {
      path: livePath.track(2),
      methods: { create_midi_clip: () => ["id", "arr_clip_t2"] },
    });

    registerMockObject("arr_clip_t2", { properties: { length: 4 } });

    await createClip({
      trackIndex: 2,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(track2.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
  });
});

describe("processClipIteration (unit)", () => {
  it("throws when the MIDI arrangement clip fails to be created", () => {
    // create_midi_clip returns the "no object" ref, so the created clip does not
    // exist. Kills the `!clip.exists()` guard's condition/block/message mutants.
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMockObject("track-0", {
      path: livePath.track(0),
      methods: { create_midi_clip: () => ["id", "0"] },
    });

    expect(() => callArrangementIteration({})).toThrow(
      "failed to create Arrangement clip",
    );
  });

  it("does NOT set an empty name on an audio clip", () => {
    // clipName "" is falsy, so `if (clipName)` skips it. The → true mutant would
    // add name:"" and setAll (which keeps "") would write it.
    const { clip } = setupAudioArrangementClipMocks();

    callArrangementIteration({
      sampleFile: "/samples/loop.wav",
      clipName: "",
      color: "#FF0000",
    });

    expect(clip.set).not.toHaveBeenCalledWith("name", expect.anything());
  });

  it("does NOT call setAll on an audio clip with no name or color", () => {
    // Empty propsToSet → the `length > 0` guard skips setAll. The → true and
    // > → >= mutants would call setAll({}).
    setupAudioArrangementClipMocks();
    const setAllSpy = vi.spyOn(LiveAPI.prototype, "setAll");

    callArrangementIteration({ sampleFile: "/samples/loop.wav" });

    expect(setAllSpy).not.toHaveBeenCalled();
  });
});
