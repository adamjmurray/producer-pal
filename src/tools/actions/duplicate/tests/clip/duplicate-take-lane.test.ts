// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_TAKE_LANES } from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

// Capture take lane warnings
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementClip,
  registerSessionClipDuplication,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

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

interface SourceClipOptions {
  /** Extra clip properties merged over the defaults (e.g. `color`). */
  extraProps?: Record<string, number>;
  /** Custom get_notes_extended implementation (e.g. windowed pickup reads). */
  getNotesExtended?: (...args: unknown[]) => string;
}

/**
 * Register a source arrangement clip (track 0, main lane) for duplication.
 * @param midi - Whether the source is a MIDI clip
 * @param notes - Notes returned by the source's get_notes_extended
 * @param options - Extra clip properties / custom get_notes_extended
 */
function registerArrangementSource(
  midi: boolean,
  notes: Array<Record<string, number>> = [SOURCE_NOTE],
  options: SourceClipOptions = {},
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
      ...options.extraProps,
    },
    methods: {
      get_notes_extended:
        options.getNotesExtended ?? (() => JSON.stringify({ notes })),
    },
  });
}

/**
 * Register a source clip that already lives on a take lane (track 0, lane 0) —
 * the shape a promote reads from.
 * @param extraProps - Clip properties merged over the MIDI defaults
 */
function registerTakeLaneSource(extraProps: Record<string, number> = {}): void {
  registerMockObject("tl_src_clip", {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
    type: "Clip",
    properties: {
      is_midi_clip: 1,
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
      ...extraProps,
    },
    methods: {
      get_notes_extended: () => JSON.stringify({ notes: [SOURCE_NOTE] }),
    },
  });
}

/**
 * Register a MIDI source on an empty take-lane track, run a take-lane duplicate,
 * and return the newly created lane clip mock for assertions.
 * @param overrides - Extra duplicate args merged over the take-lane defaults
 * @param notes - Notes returned by the source's get_notes_extended
 * @param sourceOptions - Extra source-clip properties / custom get_notes_extended
 * @returns The new lane clip mock, or undefined if none was created
 */
async function duplicateToFreshLane(
  overrides: Partial<Parameters<typeof duplicate>[0]> = {},
  notes: Array<Record<string, number>> = [SOURCE_NOTE],
  sourceOptions: SourceClipOptions = {},
): Promise<ReturnType<typeof lookupMockObject>> {
  registerLiveSet();
  registerArrangementSource(true, notes, sourceOptions);
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
    // The lane's path is reported so the user can find the new clip, along with
    // what re-creating cost: notes come across, automation doesn't. Live can't
    // say whether a clip has envelopes, so the note is unconditional.
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `created on take lane "t0/l0" (automation envelopes aren't copied)`,
      ),
    );
    expect(result).toMatchObject({
      path: "t0/l0",
      arrangementStart: "5|1",
    });
  });

  it("copies the source clip's color when no color override is given", async () => {
    const newClip = await duplicateToFreshLane({}, [], {
      extraProps: { color: 0x123456 },
    });

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

    const newClip = await duplicateToFreshLane({}, [], {
      getNotesExtended: (_pitch, _pitchSpan, fromTime, span) =>
        JSON.stringify({
          notes: allNotes.filter(
            (n) =>
              n.start_time >= (fromTime as number) &&
              n.start_time < (fromTime as number) + (span as number),
          ),
        }),
    });

    expect(newClip?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [pickup, SOURCE_NOTE],
    });
  });

  it("warns and ignores arrangementLength for take-lane duplication", async () => {
    await duplicateToFreshLane({ arrangementLength: "2bar" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("arrangementLength ignored for the re-created"),
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
      expect.stringContaining("take lanes hold MIDI clips only"),
    );
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(result).toStrictEqual([]);
  });

  // Warn-and-skip: the lane destination is the only one that can't be served.
  it("still makes an audio source's main-lane copies", async () => {
    registerLiveSet();
    registerArrangementSource(false);
    const laneTrack = registerTakeLaneTrack({
      trackIndex: 1,
      initialLanes: 1,
      hasMidiInput: 0,
    });
    const mainTrack = registerTrackWithArrangementDup(2, { has_midi_input: 0 });

    registerArrangementClip(2, 0, 0);

    const result = await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t2,t1/l0",
      arrangementStart: "1|1,5|1",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("take lanes hold MIDI clips only"),
    );
    expect(mainTrack.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id src_clip",
      0,
    );
    expect(laneTrack.call).not.toHaveBeenCalledWith("create_take_lane");
    // One result, not zero: only the lane copy was skipped.
    expect(result).toStrictEqual({
      id: livePath.track(2).arrangementClip(0),
      path: "t2",
      arrangementStart: "1|1",
    });
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

  it("warns and skips when Live fails to create a take-lane clip (single position)", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerTakeLaneTrack({ initialLanes: 0, clipCreationFails: true });

    const created = (await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l+",
      arrangementStart: "1|1",
    })) as object[];

    expect(created).toStrictEqual([]);
    // The wrapped warning carries the inner "failed to create Arrangement clip"
    // throw (from the not-exists guard), not some other downstream error.
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "failed to create take-lane clip at beat 0: failed to create Arrangement clip",
      ),
    );
  });

  it("warns and continues when only some positions fail (partial success)", async () => {
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

    const created = (await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l0",
      arrangementStart: "1|1, 2|1, 3|1",
    })) as object[];

    expect(created).toHaveLength(2);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("failed to create take-lane clip at beat 4"),
    );
  });

  it("re-creates over an existing clip on a populated lane (replace, like the main lane)", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    // Existing lane 1 already holds a clip at beats 0-4.
    const track = registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [[{ start: 0, end: 4 }]],
    });

    const created = (await duplicate({
      type: "clip",
      id: "src_clip",
      // beat 0 on the EXISTING populated lane
      toPath: "t0/l0",
      arrangementStart: "1|1",
    })) as object;

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    // No overlap guard: the clip is re-created on the populated lane, and no
    // new lane is created (the target already exists).
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(created).toHaveProperty("id");
  });

  it("duplicates onto the take lane a toPath names", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    const track = registerTakeLaneTrack({ initialLanes: 2 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l1",
      arrangementStart: "5|1",
    });

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(1))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 4);
  });

  // Impossible with the takeLane param, which named one lane for the whole
  // call: each destination carries its own.
  it("puts each destination on the lane it named, main lane included", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    const track = registerTakeLaneTrack({ initialLanes: 2 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l0,t0/l1",
      arrangementStart: "5|1,9|1",
    });

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 4);
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(1))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 32, 4);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("ignores the takeLane alias when toPath already names a lane", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerTakeLaneTrack({ initialLanes: 3 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l2",
      arrangementStart: "5|1",
      takeLane: "1",
    });

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(2))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 4);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('takeLane ignored — "toPath" already names'),
    );
  });

  // One destination can't tell the guard apart from its opposite: `some` and
  // `every` agree on a one-item list. With two, the alias reaches a destination
  // that named no lane, which is the thing being refused.
  it("ignores the takeLane alias when any toPath names a lane", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerTakeLaneTrack({ initialLanes: 3 });

    const mainTrack = registerTrackWithArrangementDup(1, { has_midi_input: 1 });

    registerArrangementClip(1, 0, 32);

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l2,t1",
      arrangementStart: "5|1,9|1",
      takeLane: "1",
    });

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(2))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 4);
    // t1 named no lane, so it stays on the main lane rather than inheriting one.
    expect(mainTrack.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id src_clip",
      32,
    );
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('takeLane ignored — "toPath" already names'),
    );
  });

  // takeLane "new" appends a lane every time it is resolved, so the lane has to
  // be resolved once per DESTINATION TRACK, not once per copy.
  it("stacks every copy on one new lane when toPath repeats a track", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const dest = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    const result = (await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t1",
      arrangementStart: "5|1, 9|1, 13|1",
      takeLane: "new",
    })) as Array<{ path: string }>;

    expect(dest.call).toHaveBeenCalledTimes(1);
    expect(dest.call).toHaveBeenCalledWith("create_take_lane");
    expect(result.map((copy) => copy.path)).toStrictEqual([
      "t1/l0",
      "t1/l0",
      "t1/l0",
    ]);

    const lane = lookupMockObject(undefined, livePath.track(1).takeLane(0));

    expect(lane?.call).toHaveBeenCalledTimes(3);
  });

  it("gives each toPath track its own new lane", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const first = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });
    const second = registerTakeLaneTrack({ trackIndex: 2, initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t1, t2",
      arrangementStart: "5|1",
      takeLane: "new",
    });

    expect(first.call).toHaveBeenCalledTimes(1);
    expect(second.call).toHaveBeenCalledTimes(1);
  });

  // Live has no take-lane delete, so a cap error partway through a multi-track
  // resolve would strand an empty lane on every track that already succeeded.
  it("creates no lane at all when a later toPath track is at the lane cap", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const ok = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    registerTakeLaneTrack({ trackIndex: 2, initialLanes: MAX_TAKE_LANES });

    await expect(
      duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t1, t2",
        arrangementStart: "5|1",
        takeLane: "new",
      }),
    ).rejects.toThrow(`${MAX_TAKE_LANES} take lane limit`);

    expect(ok.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  // Same hazard within one track: l7 fills it to the cap, so l+ has nowhere to
  // go. Both destinations read the same pre-call count, so neither sees it.
  it("creates no lane when two lanes on one track exceed the cap together", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const track = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    await expect(
      duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t1/l7,t1/l+",
        arrangementStart: "1|1,5|1",
      }),
    ).rejects.toThrow(`${MAX_TAKE_LANES} take lane limit`);

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("appends one lane per l+ in toPath", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    registerTakeLaneTrack({ initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l+,t0/l+",
      arrangementStart: "1|1",
    });

    // Both copies sit at bar 1, one per fresh lane.
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(1))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
  });

  // The list cycles, so one written l+ covers all three positions. Numbering
  // the expanded copies instead would scatter them over three lanes.
  it("keeps one l+ on one lane across several arrangementStarts", async () => {
    registerLiveSet();
    registerArrangementSource(true);

    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      toPath: "t0/l+",
      arrangementStart: "1|1,2|1,3|1",
    });

    expect(track.call).toHaveBeenCalledExactlyOnceWith("create_take_lane");

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
  });

  // A take-lane SOURCE only ever gets read, so lane→lane needs nothing special —
  // but nothing else in this suite copies FROM a lane, so it's covered here.
  it("copies a take-lane clip onto another take lane", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource();

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      toPath: "t0/l+",
      arrangementStart: "5|1",
    });

    // Landed on the appended lane, not the one the source sits on
    expect(result).toMatchObject({ path: "t0/l1" });

    const destLane = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(1).arrangementClip(0),
    );

    expect(destLane?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [SOURCE_NOTE],
    });
  });

  // Promotion goes through the same re-create as a lane write, because
  // duplicate_clip_to_arrangement no-ops on a take-lane SOURCE id.
  it("promotes a take-lane clip to the main lane when the destination names no lane", async () => {
    registerLiveSet();

    const track = registerTakeLaneTrack({ initialLanes: 1 });

    registerTakeLaneSource();

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 4);
    // Reported on the main lane ("t0"), not a lane path.
    expect(result).toMatchObject({ path: "t0" });

    // It's a copy: nothing tries to clear the source off its lane.
    expect(track.call).not.toHaveBeenCalledWith(
      "delete_clip",
      expect.anything(),
    );
  });

  it("copies the source's notes onto the promoted clip", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource();

    await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    const promoted = lookupMockObject(
      undefined,
      livePath.track(0).arrangementClip(0),
    );

    expect(promoted?.call).toHaveBeenCalledWith("add_new_notes", {
      notes: [SOURCE_NOTE],
    });
  });

  // A promote emitted no warning at all before, so the envelope loss was silent.
  // Like the other re-create warnings, it's per call rather than per copy.
  it("warns once that a promoted copy loses automation envelopes", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource();

    await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "1|1,2|1,3|1",
    });

    const warnings = vi
      .mocked(consoleMock.warn)
      .mock.calls.filter(([message]) =>
        String(message).includes("automation envelopes aren't copied"),
      );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.[0]).toContain("promoted to the main lane");
  });

  // Promoting re-creates from notes, which an audio clip has none of.
  // The reason doesn't change per copy, so neither should the warning.
  it("warns once that an audio take can't be promoted, not once per position", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });
    registerTakeLaneSource({ is_midi_clip: 0, is_audio_clip: 1 });

    const result = await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "1|1,2|1,3|1,4|1",
    });

    const promoteWarnings = vi
      .mocked(consoleMock.warn)
      .mock.calls.filter(([message]) =>
        String(message).includes("can't be promoted off its take lane"),
      );

    expect(promoteWarnings).toHaveLength(1);
    expect(result).toStrictEqual([]);
  });
});
