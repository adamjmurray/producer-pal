// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  createNote,
  expectedDrumPatternNotes,
} from "#src/test/test-data-builders.ts";
import { setupClipSplittingMocks } from "#src/tools/shared/arrangement/tests/helpers/arrangement-splitting-test-helpers.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { processSingleClipUpdate } from "#src/tools/clip/update/helpers/update-clip-helpers.ts";
import * as sessionHelpers from "#src/tools/clip/update/helpers/update-clip-session-helpers.ts";
import {
  mockMergeNoteTracking,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { toolDefUpdateClip } from "#src/tools/clip/update/update-clip.def.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import * as selectModule from "#src/tools/session/select.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

// applyCodeToSingleClip is mocked so the code-exec loop in update-clip.ts can be
// driven in isolation (return value / call count) without real note execution.
vi.mock(import("#src/tools/clip/code-exec/apply-code-to-clip.ts"), () => ({
  applyCodeToSingleClip: vi.fn(),
}));

describe("updateClip - Basic operations", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  it("should warn and return empty when neither id nor path is given", async () => {
    expect(await updateClip({})).toStrictEqual([]);
    expect(capturedWarnings()).toContain("updateClip: id or path is required");

    clearCapturedWarnings();
    expect(await updateClip({ name: "Test" })).toStrictEqual([]);
    expect(capturedWarnings()).toContain("updateClip: id or path is required");
  });

  // id and path both name clips, so a path keeps the call non-empty while an
  // id whose entries all trim away drops out unnoticed. The caller asked for
  // those ids.
  // The path would have carried the call, but an id that names nothing is still
  // a malformed list — and one the caller can only have meant something by.
  it("should refuse an empty id even when path carries the call", async () => {
    setupMidiClipMock(mocks.clip456);

    await expect(
      updateClip({ id: ",  ,", path: "t1/s1", name: "By Path" }),
    ).rejects.toThrow('invalid id ",  ," - it names nothing');
    expect(mocks.clip456.set).not.toHaveBeenCalled();
  });

  it("should refuse an empty id given on its own", async () => {
    await expect(updateClip({ id: ",  ," })).rejects.toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  // A permanent alias, not a migration: models reach for the plural on their
  // own, so it keeps working.
  it("still updates by the ids alias", async () => {
    await updateClip({ ids: "123", name: "Renamed" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Renamed");
  });

  it("should overlay new notes onto existing notes", async () => {
    setupMidiClipMock(mocks.clip123, {
      length: 4,
    });

    // Mock existing notes, then return added notes on subsequent calls
    mockMergeNoteTracking(mocks.clip123, [createNote()]);

    const result = await updateClip({
      id: "123",
      notes: "D3 1|2",
    });

    // Should call get_notes_extended to read existing notes for the merge
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "get_notes_extended",
      0,
      128,
      // Window varies with clip length; clip-notes.test.ts pins it exactly.
      expect.any(Number),
      expect.any(Number),
    );

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 }); // Existing C3 + new D3
  });

  it("should log warning when clip ID doesn't exist", async () => {
    mockNonExistentObjects();

    const result = await updateClip({
      id: "nonexistent",
      notes: "1|1 60",
    });

    expect(result).toStrictEqual([]);
    expect(capturedWarnings()).toContain(
      'updateClip: id "nonexistent" does not exist',
    );
  });

  // Saves a read-then-update round trip: a caller that knows where the clip is
  // shouldn't have to read it first just to learn its id.
  it("should update a clip addressed by path", async () => {
    setupMidiClipMock(mocks.clip456);

    // clip456 sits at t1/s1
    const result = await updateClip({ path: "t1/s1", name: "By Path" });

    expect(mocks.clip456.set).toHaveBeenCalledWith("name", "By Path");
    expect(result).toStrictEqual({ id: "456", path: "t1/s1" });
  });

  it("should warn and skip a path with no clip, keeping the rest", async () => {
    setupMidiClipMock(mocks.clip456);
    mockNonExistentObjects();

    const result = await updateClip({ path: "t9/s9,t1/s1", name: "By Path" });

    expect(capturedWarnings()).toContain('updateClip: no clip at path "t9/s9"');
    expect(result).toStrictEqual({ id: "456", path: "t1/s1" });
  });

  it("should update a single session clip by ID", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      name: "Updated Clip",
      color: "#FF0000",
      looping: true,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("name", "Updated Clip");
    expect(mocks.clip123.set).toHaveBeenCalledWith("color", 16711680);
    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", true);

    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should update a single arrangement clip by ID", async () => {
    setupMidiClipMock(mocks.clip789, {
      is_arrangement_clip: 1,
      start_time: 16.0,
    });

    const result = await updateClip({
      id: "789",
      name: "Arrangement Clip",
      start: "1|3", // 2 beats = bar 1 beat 3 in 4/4
      length: "1bar", // 4 beats = 1 bar
    });

    expect(mocks.clip789.set).toHaveBeenCalledWith("name", "Arrangement Clip");
    expect(mocks.clip789.set).toHaveBeenCalledWith("loop_start", 2); // 1|3 in 4/4 = 2 Ableton beats
    expect(mocks.clip789.set).toHaveBeenCalledWith("loop_end", 6); // start (2) + length (4) = 6 Ableton beats
    expect(mocks.clip789.set).toHaveBeenCalledWith("end_marker", 6); // start (2) + length (4) = 6 Ableton beats

    expect(result).toStrictEqual({ id: "789", path: "t2" });
  });

  it("should switch to Arranger view when updating arrangement clips", async () => {
    setupMidiClipMock(mocks.clip999, {
      is_arrangement_clip: 1,
      start_time: 32.0,
    });

    const result = await updateClip({
      id: "999",
      name: "Test Arrangement Clip",
    });

    // Verify result is returned (view switching is a side effect)
    expect(result).toStrictEqual({ id: "999", path: "t3" });
  });

  it("should update multiple clips by comma-separated IDs", async () => {
    setupMidiClipMock(mocks.clip123);
    setupAudioClipMock(mocks.clip456);

    const result = await updateClip({
      id: "123, 456",
      color: "#00FF00",
      looping: false,
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("color", 65280);
    expect(mocks.clip123.set).toHaveBeenCalledWith("looping", false);
    expect(mocks.clip123.set).toHaveBeenCalledTimes(2);

    expect(mocks.clip456.set).toHaveBeenCalledWith("color", 65280);
    expect(mocks.clip456.set).toHaveBeenCalledWith("looping", false);
    expect(mocks.clip456.set).toHaveBeenCalledTimes(2);

    expect(result).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("should update time signature when provided", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      timeSignature: "6/8",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should write notes with real bar|beat parsing in 4/4 time", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      // n/2 = half = 2 quarters; n/4 = quarter
      notes: "v80 n/2 C4 1|1 v120 n/4 D4 1|3",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote({ pitch: 72, velocity: 80, duration: 2 }),
        createNote({ pitch: 74, velocity: 120, start_time: 2 }),
      ],
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
  });

  it("should parse notes using provided time signature with real bar|beat parsing", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
    });

    // In 6/8 time, bar 2 beat 1 = 3 Ableton beats (6 musical beats * 4/8).
    // Default duration is a quarter note regardless of meter (1 Ableton beat).
    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote({ duration: 1 }),
        createNote({ pitch: 62, start_time: 3, duration: 1 }),
      ],
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(mocks.clip123.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
  });

  it("should parse notes using clip's current time signature when timeSignature not provided", async () => {
    setupMidiClipMock(mocks.clip123, {
      signature_numerator: 3,
      signature_denominator: 4,
    }); // 3/4 time

    const result = await updateClip({
      id: "123",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        createNote(),
        createNote({ pitch: 62, start_time: 3 }), // Beat 3 in 3/4 time
      ],
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 2 });
  });

  it("should handle complex drum pattern with real bar|beat parsing", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({
      id: "123",
      notes:
        "v100 n/16 p1.0 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1.0 D1 v100 p0.9 Gb1 1|2",
    });

    expect(mocks.clip123.call).toHaveBeenCalledWith("add_new_notes", {
      notes: expectedDrumPatternNotes(),
    });

    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 5 });
  });

  it("should throw error for invalid time signature format", async () => {
    setupMidiClipMock(mocks.clip123);

    await expect(
      updateClip({
        id: "123",
        timeSignature: "invalid",
      }),
    ).rejects.toThrow("Time signature must be in format");
  });

  /**
   * Register mock objects for toSlot tests (source clip slot + target slot + target clip).
   */
  function setupToSlotMocks(): void {
    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
    });

    registerMockObject("live_set/tracks/1/clip_slots/2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });

    registerMockObject("live_set/tracks/1/clip_slots/2/clip", {
      path: livePath.track(1).clipSlot(2).clip(),
    });
  }

  it("should move session clip with toSlot", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const result = await updateClip({ id: "123", toSlot: "1/2" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/2/clip",
      path: "t1/s2",
    });
  });

  it("should move session clip with toPath", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const result = await updateClip({ id: "123", toPath: "t1/s2" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/2/clip",
      path: "t1/s2",
    });
  });

  // `slot` in a result reads "1/2", and a model pastes it straight back. That's
  // a well-founded guess, not a typo — make the move and warn to teach the
  // spelling that replaced it.
  it("should honor a toPath in the old unprefixed spelling, with a warning", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const result = await updateClip({ id: "123", toPath: "1/2" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/2/clip",
      path: "t1/s2",
    });
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'toPath "1/2" is the old slot spelling; use "t1/s2"',
      ),
    );
  });

  // The silent-no-op twin of duplicate's ",": update-clip warns rather than
  // throwing, but it must not stay quiet about a move that never happened.
  it.each([
    // toPath is refused when its entries are split; toSlot reads as unset, so
    // it never reaches a parser — a pairing check must not count it as sent.
    ["toPath", 'invalid toPath "," - it names nothing'],
    ["toSlot", 'toSlot "," names nothing'],
  ])(
    "should warn when %s was sent but names nothing",
    async (param, reason) => {
      setupMidiClipMock(mocks.clip123);
      setupToSlotMocks();

      const result = await updateClip({ id: "123", [param]: "," });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(reason),
      );
      expect(result).not.toHaveProperty("slot");
    },
  );

  // The caller asked for no move. Say the param named nothing rather than
  // reporting a move that failed, and let the rest of the update land.
  it("should warn when toPath was sent as null", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    // The word, written out by a model that had no destination to name.
    const result = await updateClip({ id: "123", toPath: "null" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('toPath "null" names nothing'),
    );
    expect(result).not.toHaveProperty("slot");
  });

  // toSlot is deprecated, so a caller dropping it may still send the key as
  // null. That is not a destination that failed — it is no destination.
  it("should ignore a toSlot sent as null without warning", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const toSlot = toolDefUpdateClip.toolOptions.inputSchema.toSlot?.parse(
      null,
    ) as string;
    const result = await updateClip({ id: "123", toSlot });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("clip not moved"),
    );
    expect(result).not.toHaveProperty("slot");
  });

  it("should ignore an empty toSlot instead of moving the clip", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const result = await updateClip({ id: "123", toSlot: "" });

    expect(result).not.toHaveProperty("slot");
  });

  it("should warn about destinations with no clip to move", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    const consoleModule = await import("#src/shared/max/v8-max-console.ts");
    const warnSpy = vi.spyOn(consoleModule, "warn");

    const result = await updateClip({ id: "123", toSlot: "1/2, 3/4" });

    expect(warnSpy).toHaveBeenCalledWith(
      "toSlot: 2 destinations for 1 clip; the extra destinations went unused",
    );

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/2/clip",
      path: "t1/s2",
    });
  });

  it("should NOT warn about multiple destinations for a single toSlot", async () => {
    setupMidiClipMock(mocks.clip123);
    setupToSlotMocks();

    await updateClip({ id: "123", toSlot: "1/2" });

    // slots.length is exactly 1 here: the > 1 guard must stay false so no
    // "using first" warning fires (kills > 1 -> >= 1 and the forced-true mutant).
    expect(capturedWarnings()).not.toContain(
      "toSlot: 2 destinations for 1 clip; the extra destinations went unused",
    );
  });

  it("should refuse more names than clips, naming both counts", async () => {
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);

    await expect(
      updateClip({ id: "123, 456", name: "A, B, C" }),
    ).rejects.toThrow("id and path names 2 entries but name names 3 entries.");

    expect(mocks.clip123.set).not.toHaveBeenCalledWith("name", "A");
  });

  describe("focus", () => {
    it("should select the last updated clip when focus is set", async () => {
      setupMidiClipMock(mocks.clip123);
      const selectSpy = vi
        .spyOn(selectModule, "select")
        .mockReturnValue({} as never);

      await updateClip({ id: "123", focus: true });

      expect(selectSpy).toHaveBeenCalledWith({
        id: "123",
        detailView: "clip",
      });
    });

    it("should NOT select when focus is omitted", async () => {
      setupMidiClipMock(mocks.clip123);
      const selectSpy = vi
        .spyOn(selectModule, "select")
        .mockReturnValue({} as never);

      await updateClip({ id: "123" });

      // focus is falsy so the whole guard must be false (kills forced-true).
      expect(selectSpy).not.toHaveBeenCalled();
    });

    it("should NOT select or throw when focus is set but nothing was updated", async () => {
      mockNonExistentObjects();
      const selectSpy = vi
        .spyOn(selectModule, "select")
        .mockReturnValue({} as never);

      // updatedClips.length is 0; the > 0 guard must stay false (kills >= 0,
      // which would read updatedClips.at(-1).id on an empty array and throw).
      const result = await updateClip({ id: "nonexistent", focus: true });

      expect(result).toStrictEqual([]);
      expect(selectSpy).not.toHaveBeenCalled();
    });
  });

  it("should quantize a MIDI clip via the call-site options object", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", quantize: 1 });

    // The options object passed to handleQuantization must carry quantize;
    // blanking it to {} would skip quantization entirely. 5 == QUANTIZE_GRID 1/16.
    expect(mocks.clip123.call).toHaveBeenCalledWith("quantize", 5, 1);
  });

  it("should run warp marker operations when warpOp is provided", async () => {
    setupAudioClipMock(mocks.clip456, { file_path: "/audio/test.wav" });

    await updateClip({ id: "456", warpOp: "add" });

    // handleWarpMarkerOperation runs only inside the warpOp != null guard; with
    // no warpBeatTime it warns, proving the guarded block executed.
    expect(capturedWarnings()).toContain(
      "warpBeatTime required for add operation",
    );
  });

  it("should write notes and not treat a MIDI clip as audio", async () => {
    setupMidiClipMock(mocks.clip123);

    const result = await updateClip({ id: "123", notes: "C3 1|1" });

    // isAudioClip must be false: notes are written and the audio-only warning
    // must not fire (forced-true would suppress notes and warn instead).
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
    expect(capturedWarnings()).not.toContain(
      "notes parameter ignored for audio clip",
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 1 });
  });

  it("should warn that audio-only parameters were ignored on a MIDI clip", async () => {
    setupMidiClipMock(mocks.clip123);

    await updateClip({ id: "123", warping: false, gainDb: -6 });

    expect(capturedWarnings()).toContain(
      "gainDb, warping ignored for MIDI clips",
    );
  });

  it("should apply code exactly once per clip without a failure warning", async () => {
    setupMidiClipMock(mocks.clip123);
    vi.mocked(applyCodeToSingleClip).mockResolvedValue(3);

    const result = await updateClip({ id: "123", code: "return notes" });

    // Loop bound is j < length: exactly one call, no extra iteration that would
    // dereference undefined and emit a "Failed to update clip" warning.
    expect(applyCodeToSingleClip).toHaveBeenCalledTimes(1);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("Failed to update clip"),
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/s0", noteCount: 3 });
  });

  it("should omit noteCount when code exec returns null", async () => {
    setupMidiClipMock(mocks.clip123);
    vi.mocked(applyCodeToSingleClip).mockResolvedValue(null);

    const result = await updateClip({ id: "123", code: "return notes" });

    // noteCount != null guard: a null result must not set the field.
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
    expect(result).not.toHaveProperty("noteCount");
  });

  it("should thread isNonSurvivor from nonSurvivorClipIds into position ops", async () => {
    setupMidiClipMock(mocks.clip123);
    const clip = LiveAPI.from("id 123");
    const posSpy = vi
      .spyOn(sessionHelpers, "handlePositionOperations")
      .mockImplementation(() => {
        /* intercept only */
      });

    processSingleClipUpdate({
      clip,
      clipIndex: 0,
      clipCount: 1,
      destinationParam: "toPath",
      context: {},
      updatedClips: [],
      movedClipGroups: new Map(),
      nonSurvivorClipIds: new Set(["123"]),
    });

    // clip.id "123" is in the set, so isNonSurvivor must be true (?? false, not
    // && false which would force it false).
    expect(posSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isNonSurvivor: true }),
    );
  });
});

describe("updateClip - splitting mutation coverage", () => {
  it("should warn when arrangementSplit targets a non-arrangement clip", async () => {
    const mocks = setupUpdateClipMocks();

    setupMidiClipMock(mocks.clip123); // session clip: is_arrangement_clip = 0

    const result = await updateClip({ id: "123", arrangementSplit: "2|1" });

    // Session clips are excluded from arrangementClips, so prepareSplitParams
    // sees an empty list and warns. The <= 0 guard must return false for them
    // (forced-true / never-false mutants would include the clip and split it).
    expect(capturedWarnings()).toContain(
      "arrangementSplit requires arrangement clips",
    );
    expect(result).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("should split an arrangement clip and return the fresh clips only", async () => {
    const clipId = "clip_1";
    const { callState } = setupClipSplittingMocks(clipId);

    // rescanSplitClips reads arrangement_clips: return one real fresh clip plus
    // a non-existent one (id "0") that clip.exists() must filter out.
    const freshClipId = "fresh_clip";

    registerMockObject(freshClipId, {
      path: livePath.track(0).arrangementClip(2),
      type: "Clip",
      properties: {
        start_time: 0.0,
        is_midi_clip: 1,
        is_arrangement_clip: 1,
      },
    });

    const trackMock = lookupMockObject("track_0", livePath.track(0));
    const origGet = trackMock?.get.getMockImplementation();

    trackMock?.get.mockImplementation((prop: string) => {
      if (prop === "arrangement_clips") return ["id", freshClipId, "id", "0"];

      return origGet ? origGet(prop) : [0];
    });

    const result = await updateClip(
      { id: clipId, arrangementSplit: "2|1" },
      {},
    );

    // Splitting ran (arrangement clip kept by the <= 0 / >= 0 boundary)...
    expect(callState.trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );

    const resultIds = (Array.isArray(result) ? result : [result]).map(
      (r) => r.id,
    );

    // ...and the exists() filter keeps the fresh clip, drops the missing "0".
    expect(resultIds).toContain(freshClipId);
    expect(resultIds).not.toContain("0");
  });

  it("should not split (or throw) when the split format is invalid", async () => {
    const clipId = "clip_1";
    const { callState } = setupClipSplittingMocks(clipId);

    // arrangementSplit is provided but unparseable, so splitPoints is null. The guard's
    // splitPoints != null term must stay honored (forced-true / || mutants
    // would call performSplitting with null and throw).
    const result = await updateClip(
      { id: clipId, arrangementSplit: "not-a-position" },
      {},
    );

    expect(result).toBeDefined();
    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
  });
});
