// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/take-lane-test-helpers.ts";

// Capture take lane warnings
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { duplicateClipsToTakeLane } from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-helpers.ts";
import { registerSessionClipDuplication } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import * as consoleMock from "#src/shared/v8-max-console.ts";

const SOURCE_NOTE = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

/** Register the live_set time signature mock. */
function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/**
 * Register a source arrangement clip (track 0, main lane) for duplication.
 * @param midi - Whether the source is a MIDI clip
 * @param notes - Notes returned by the source's get_notes_extended
 */
function registerArrangementSource(
  midi: boolean,
  notes: Array<Record<string, number>> = [SOURCE_NOTE],
): void {
  registerMockObject("src_clip", {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: {
      is_midi_clip: midi ? 1 : 0,
      is_arrangement_clip: 1,
      length: 4,
      start_time: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    },
    methods: {
      get_notes_extended: () => JSON.stringify({ notes }),
    },
  });
}

/**
 * Register a MIDI source on an empty take-lane track, run a take-lane duplicate,
 * and return the newly created lane clip mock for assertions.
 * @param overrides - Extra duplicate args merged over the take-lane defaults
 * @param notes - Notes returned by the source's get_notes_extended
 * @returns The new lane clip mock, or undefined if none was created
 */
async function duplicateToFreshLane(
  overrides: Partial<Parameters<typeof duplicate>[0]> = {},
  notes: Array<Record<string, number>> = [SOURCE_NOTE],
): Promise<ReturnType<typeof lookupMockObject>> {
  registerLiveSet();
  registerArrangementSource(true, notes);
  registerTakeLaneTrack({ initialLanes: 0 });

  await duplicate({
    type: "clip",
    id: "src_clip",
    arrangementStart: "1|1",
    takeLane: "new",
    ...overrides,
  });

  return lookupMockObject(
    undefined,
    livePath.track(0).takeLane(0).arrangementClip(0),
  );
}

describe("duplicate take lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicates a MIDI clip onto a fresh take lane (notes + loop copied)", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    const result = (await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: "new",
    })) as { id: string; trackIndex: number; arrangementStart: string };

    expect(track.call).toHaveBeenCalledWith("create_take_lane");

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 16, 4);

    const newClip = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0).arrangementClip(0),
    );

    expect(newClip?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [SOURCE_NOTE],
    });
    // Every loop/marker/signature property is copied from the source (each read
    // is a distinct getProperty; blanking any one would set undefined instead).
    expect(newClip?.set).toHaveBeenCalledWith("start_marker", 0);
    expect(newClip?.set).toHaveBeenCalledWith("loop_start", 0);
    expect(newClip?.set).toHaveBeenCalledWith("loop_end", 4);
    expect(newClip?.set).toHaveBeenCalledWith("end_marker", 4);
    expect(newClip?.set).toHaveBeenCalledWith("looping", 1);
    expect(newClip?.set).toHaveBeenCalledWith("signature_numerator", 4);
    expect(newClip?.set).toHaveBeenCalledWith("signature_denominator", 4);
    // The lane number (1-based) is reported so the user can find the new clip.
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("created on take lane 1"),
    );
    expect(result).toMatchObject({
      trackIndex: 0,
      arrangementStart: "5|1",
      takeLane: 1,
    });
  });

  it("copies the source clip's color when no color override is given", async () => {
    registerLiveSet();
    registerMockObject("src_clip", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        length: 4,
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
        end_marker: 4,
        looping: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        color: 0x123456,
      },
      methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
    });
    registerTakeLaneTrack({ initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    const newClip = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0).arrangementClip(0),
    );

    // No override → the raw source color int is copied straight through (the
    // else branch, bypassing setColor's #RRGGBB path).
    expect(newClip?.set).toHaveBeenCalledWith("color", 0x123456);
  });

  it("captures a pickup note (negative start_time) when copying to a take lane", async () => {
    registerLiveSet();

    // A pickup sits just before the clip start. The source's get_notes_extended
    // honors the requested [from_time, from_time + span) window, so reading only
    // from time 0 (the old behavior) dropped the pickup; the scan window must
    // start at -length to capture it.
    const pickup = { ...SOURCE_NOTE, start_time: -0.5 };
    const allNotes = [pickup, SOURCE_NOTE];

    registerMockObject("src_clip", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        length: 4,
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
        end_marker: 4,
        looping: 1,
        signature_numerator: 4,
        signature_denominator: 4,
      },
      methods: {
        get_notes_extended: (_pitch, _pitchSpan, fromTime, span) =>
          JSON.stringify({
            notes: allNotes.filter(
              (n) =>
                n.start_time >= (fromTime as number) &&
                n.start_time < (fromTime as number) + (span as number),
            ),
          }),
      },
    });
    registerTakeLaneTrack({ initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "1|1",
      takeLane: "new",
    });

    const newClip = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0).arrangementClip(0),
    );

    expect(newClip?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [pickup, SOURCE_NOTE],
    });
  });

  it("warns and ignores arrangementLength for take-lane duplication", async () => {
    await duplicateToFreshLane({ arrangementLength: "2bar" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("arrangementLength ignored for take-lane"),
    );
  });

  it("strips Live note metadata before re-adding to the take lane", async () => {
    const newClip = await duplicateToFreshLane({}, [
      { ...SOURCE_NOTE, note_id: 7, mute: 0, release_velocity: 64 },
    ]);

    // note_id/mute/release_velocity must not survive into add_new_notes
    expect(newClip?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [SOURCE_NOTE],
    });
  });

  it("applies explicit name and color overrides to the take-lane copy", async () => {
    const newClip = await duplicateToFreshLane({
      name: "Variation A",
      color: "#FF0000",
    });

    expect(newClip?.set).toHaveBeenCalledWith("name", "Variation A");
    // setColor("#FF0000") converts to Live's 0x00RRGGBB int
    expect(newClip?.set).toHaveBeenCalledWith("color", 0xff0000);
  });

  it("skips add_new_notes when the source clip is empty", async () => {
    const newClip = await duplicateToFreshLane({}, []);

    expect(newClip?.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("skips an audio source with a warning (MIDI-only)", async () => {
    registerLiveSet();
    registerArrangementSource(false);
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    const result = await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane supports MIDI clips only"),
    );
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(result).toStrictEqual([]);
  });

  it("warns and ignores takeLane for a session destination", async () => {
    registerSessionClipDuplication({ destClipProperties: {} });

    await duplicate({
      type: "clip",
      id: "clip1",
      toSlot: "0/1",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session destination"),
    );
  });

  it("warns and ignores takeLane for non-clip types", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    await duplicate({ type: "track", id: "track1", takeLane: "new" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "takeLane ignored: only supported when duplicating clips",
      ),
    );
  });

  it("ignores (does not validate) an invalid takeLane for a session-clip destination", async () => {
    // Regression: previously normalizeTakeLaneTarget ran for any clip type, so
    // a malformed takeLane on a session duplicate threw before the
    // warn-and-ignore path could fire. The skip path warns instead.
    registerSessionClipDuplication({ destClipProperties: {} });

    await duplicate({
      type: "clip",
      id: "clip1",
      toSlot: "0/1",
      takeLane: "garbage",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session destination"),
    );
  });

  it("ignores (does not validate) an invalid takeLane for non-clip types", async () => {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    // "garbage" would throw if normalized; for a non-clip type it is dropped
    // (this await would reject if the value were still validated).
    await duplicate({ type: "track", id: "track1", takeLane: "garbage" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "takeLane ignored: only supported when duplicating clips",
      ),
    );
  });

  it("warns and skips when Live fails to create a take-lane clip (single position)", () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerTakeLaneTrack({ initialLanes: 0, clipCreationFails: true });

    const created = duplicateClipsToTakeLane(
      LiveAPI.from("src_clip"),
      "src_clip",
      [0],
      undefined,
      undefined,
      "new",
      undefined,
    );

    expect(created).toStrictEqual([]);
    // The wrapped warning carries the inner "failed to create Arrangement clip"
    // throw (from the not-exists guard), not some other downstream error.
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "failed to create take-lane clip at beat 0: failed to create Arrangement clip",
      ),
    );
  });

  it("warns and continues when only some positions fail (partial success)", () => {
    registerLiveSet();
    registerArrangementSource(true);
    // Pre-create one lane so we can intercept its create_midi_clip mock.
    registerTakeLaneTrack({ initialLanes: 1 });

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane).toBeDefined();

    // Fail the 2nd create_midi_clip call; forward all others to the original mock.
    let callCount = 0;
    const original = lane!.call.getMockImplementation();

    lane!.call.mockImplementation((method: string, ...args: unknown[]) => {
      if (method === "create_midi_clip") {
        callCount += 1;
        if (callCount === 2) return ["id", "0"];
      }

      return original?.(method, ...args);
    });

    const created = duplicateClipsToTakeLane(
      LiveAPI.from("src_clip"),
      "src_clip",
      [0, 4, 8],
      undefined,
      undefined,
      1,
      undefined,
    );

    expect(created).toHaveLength(2);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to create take-lane clip at beat 4"),
    );
  });

  it("re-creates over an existing clip on a populated lane (replace, like the main lane)", () => {
    registerLiveSet();
    registerArrangementSource(true);
    // Existing lane 1 already holds a clip at beats 0-4.
    const track = registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [[{ start: 0, end: 4 }]],
    });

    const created = duplicateClipsToTakeLane(
      LiveAPI.from("src_clip"),
      "src_clip",
      [0], // beat 0 overlaps the existing clip on lane 1
      undefined,
      undefined,
      1, // target the EXISTING populated lane
      undefined,
    );

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    // No overlap guard: the clip is re-created on the populated lane, and no
    // new lane is created (the target already exists).
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(created).toHaveLength(1);
  });

  it("warns and skips when source is a take-lane clip and no takeLane param is given (main-lane destination)", async () => {
    registerLiveSet();
    // Register a source clip whose path includes a take_lanes segment.
    registerMockObject("tl_src_clip", {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
      type: "Clip",
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        length: 4,
      },
    });

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'source clip "tl_src_clip" is on a take lane; promoting to the main lane is not yet supported',
      ),
    );
    expect(result).toStrictEqual([]);
  });

  it("throws when the source clip has no track index", () => {
    registerMockObject("orphan_clip", {
      path: "live_set scenes 0",
      type: "Clip",
      properties: { is_midi_clip: 1 },
    });

    expect(() =>
      duplicateClipsToTakeLane(
        LiveAPI.from("orphan_clip"),
        "orphan_clip",
        [0],
        undefined,
        undefined,
        "new",
        undefined,
      ),
    ).toThrow(/no track index for clip id "orphan_clip"/);
  });
});
