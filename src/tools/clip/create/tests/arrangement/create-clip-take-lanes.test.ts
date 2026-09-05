// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_TAKE_LANES } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import {
  expectTakeLaneMidiClip,
  registerTakeLaneTrack,
} from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { registerArrangementTrack } from "../create-clip-test-helpers.ts";

// Capture take lane warnings (session-ignore, hints)
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { resolveCreateClipTakeLanes } from "#src/tools/clip/create/helpers/create-clip-prep-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

/** Register the live_set time signature mock used by createClip. */
function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

/** Register the live set plus an empty session clip slot at track 0, scene 0. */
function registerEmptyClipSlot(): void {
  registerLiveSet();
  registerMockObject("clip-slot-0-0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 0 },
  });
  registerMockObject("session-clip", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { length: 4 },
  });
}

describe("createClip take lanes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a MIDI arrangement clip on a fresh take lane", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    const result = (await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "new",
    })) as { id: string; path?: string };

    expect(track.call).toHaveBeenCalledWith("create_take_lane");
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(result.id).toMatch(/^tl_clip_/);
    // result surfaces the lane the clip landed on and where it starts
    expect(result.path).toBe("t0/l0[1|1]");
  });

  it("creates neither a lane nor a clip when a later position won't parse", async () => {
    // Regression: positions were converted one clip at a time, so bar 1 got a
    // clip and a permanent take lane before bar 0 threw — and the caller got
    // back an error naming neither of them.
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await expect(
      createClip({
        trackIndex: 0,
        arrangementStart: "1|1,0|1",
        notes: "C3",
        takeLane: "new",
      }),
    ).rejects.toThrow(/1-indexed/);

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(lookupMockObject(undefined, livePath.track(0).takeLane(0))).toBe(
      undefined,
    );
  });

  it("creates an audio arrangement clip on a take lane", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      sampleFile: "/samples/loop.wav",
      takeLane: "new",
    });

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/loop.wav",
      0,
    );
  });

  it("targets an existing lane by number without creating one", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 2 });

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: 1,
    });

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
  });

  it("names a newly created lane via takeLaneName", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "new",
      takeLaneName: "Variation B",
    });

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.set).toHaveBeenCalledWith("name", "Variation B");
  });

  it("creates over an existing clip on the lane (replace, like the main lane)", async () => {
    registerLiveSet();
    // Pre-populate lane 0 with a clip covering bar 1 (beats 0-4)
    registerTakeLaneTrack({ initialLanes: 1 });
    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    lane?.call("create_midi_clip", 0); // occupy beats 0-4

    const result = (await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: 1,
    })) as { id: string; path?: string };

    // No overlap guard: the clip is created on the targeted lane regardless
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(result.path).toBe("t0/l0[1|1]");
  });

  // A caller on the old schema still sends takeLane, sometimes with the word
  // written out — which used to throw before any clip was made.
  it.each([
    ["omitted", undefined],
    ["a coerced null", "null"],
    ["a coerced undefined", "undefined"],
  ])(
    "creates on the main lane when takeLane is %s",
    async (_label, takeLane) => {
      registerLiveSet();
      const track = registerTakeLaneTrack({ initialLanes: 0 });

      const result = (await createClip({
        trackIndex: 0,
        arrangementStart: "1|1",
        notes: "C3",
        takeLane,
      })) as { path?: string };

      expect(track.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
      expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
      expect(result.path).toBe("t0[1|1]");
      expect(consoleMock.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("takeLane"),
      );
    },
  );

  it("warns and ignores takeLane for session-only requests", async () => {
    registerEmptyClipSlot();

    await createClip({ slot: "0/0", notes: "C3", takeLane: "new" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session clips"),
    );
  });

  it("warns-and-ignores an invalid takeLane for session-only requests (does not throw)", async () => {
    registerEmptyClipSlot();

    // "garbage" would throw if normalized; for session-only it must be dropped
    // (this await would reject if the value were still validated).
    const result = await createClip({
      slot: "0/0",
      notes: "C3",
      takeLane: "garbage",
    });

    expect(result).toBeDefined();
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session clips"),
    );
  });

  it("warns that takeLane is ignored for the session portion of a mixed request", async () => {
    // A request targeting BOTH an arrangement position and a clip slot: the
    // takeLane applies to the arrangement clip but must be flagged as ignored
    // for the accompanying clip slot.
    registerEmptyClipSlot();
    registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      trackIndex: 0,
      slot: "0/0",
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "new",
    });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session clips"),
    );
  });
});

describe("createClip take lane paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates on the take lane a path names", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 2 });

    await createClip({ path: "t0/l1", arrangementStart: "1|1", notes: "C3" });

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(1));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("appends a fresh lane for l+", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({ path: "t0/l+", arrangementStart: "1|1", notes: "C3" });

    expect(track.call).toHaveBeenCalledWith("create_take_lane");
    expectTakeLaneMidiClip(0, 0);
  });

  it("appends one lane per l+ in the path", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      path: "t0/l+,t0/l+",
      arrangementStart: "1|1",
      notes: "C3",
    });

    // Both copies sit at bar 1, one per fresh lane.
    expectTakeLaneMidiClip(0, 0);
    expectTakeLaneMidiClip(1, 0);
  });

  // The stack a list of l+ can't ask for: one new lane holding takes at the
  // bars the caller named.
  it("stacks an l= on the lane the l+ before it appended", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      path: "t0/l+[1|1],t0/l=[5|1]",
      notes: "C3",
    });

    expect(track.call).toHaveBeenCalledExactlyOnceWith("create_take_lane");
    expectTakeLaneMidiClip(0, 0);
    expectTakeLaneMidiClip(0, 16);
  });

  it("refuses an l= with no l+ before it", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 1 });

    await expect(
      createClip({ path: "t0/l=[1|1]", notes: "C3" }),
    ).rejects.toThrow('path "l=" names the lane the "l+" before it appended');
  });

  // One written l+ covers all three positions, the way any single value covers
  // every item. Numbering the expanded positions instead would scatter them
  // over three lanes.
  it("keeps one l+ on one lane across several arrangementStarts", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await createClip({
      path: "t0/l+",
      arrangementStart: "1|1,2|1,3|1",
      notes: "C3",
    });

    expect(track.call).toHaveBeenCalledExactlyOnceWith("create_take_lane");

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
  });

  // Impossible with the takeLane param, which named one lane for the whole
  // call: each destination carries its own.
  it("puts each destination on the lane it named", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 3 });

    await createClip({
      path: "t0/l0,t0/l2",
      arrangementStart: "1|1,2|1",
      notes: "C3",
    });

    expectTakeLaneMidiClip(0, 0);
    expectTakeLaneMidiClip(2, 4);
  });

  it("ignores the takeLane alias when the path already names a lane", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 3 });

    await createClip({
      path: "t0/l2",
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "1",
    });

    expectTakeLaneMidiClip(2, 0);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('takeLane ignored — "path" already names'),
    );
  });

  // One destination can't tell the guard apart from its opposite: `some` and
  // `every` agree on a one-item list. With two, the alias names a lane for a
  // destination that never asked for one, which is the thing being refused.
  it("ignores the takeLane alias when any destination's path names a lane", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 3 });

    const mainTrack = registerArrangementTrack(1);

    await createClip({
      path: "t0/l2,t1",
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "1",
    });

    expectTakeLaneMidiClip(2, 0);
    // t1 named no lane, so it stays on the main lane rather than inheriting one.
    expect(mainTrack.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(mainTrack.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('takeLane ignored — "path" already names'),
    );
  });

  // A destination that can't be served must not take the others down with it.
  it("skips a destination past the lane cap and still creates the others", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });

    const mainTrack = registerArrangementTrack(1);

    const result = (await createClip({
      path: "t0/l+,t1",
      arrangementStart: "1|1",
      notes: "C3",
    })) as { path?: string };

    expect(mainTrack.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    // Only t1's clip was made, so the result collapses to that one object.
    expect(result.path).toBe("t1[1|1]");
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping "t0/l+"'),
    );
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('take lane "t0/l+" was skipped'),
    );
  });

  // The alias is 1-based and the segment is the Live API index, so takeLane 2
  // and l1 have to land on the same lane.
  it("reads the takeLane alias as the same lane the path segment names", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 3 });

    await createClip({
      path: "t0",
      arrangementStart: "1|1",
      notes: "C3",
      takeLane: "2",
    });

    expectTakeLaneMidiClip(1, 0);
  });
});

describe("resolveCreateClipTakeLanes (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves no lanes for destinations that named none", () => {
    // A track is registered so that, if the null check were skipped, the mutant
    // path would resolve a real lane instead of returning an empty map.
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: null },
    ]);

    expect(result.size).toBe(0);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("resolves a lane per destination and reports it as a path", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: "new" },
    ]);

    expect(result.get("t0/l+0")!.path).toBe("live_set tracks 0 take_lanes 0");
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('targeting take lane "t0/l0"'),
    );
  });

  // One written "l+" cycled over several arrangementStarts shares its ordinal,
  // so all its positions land on the one lane instead of splitting across three.
  it("resolves one lane per written l+, not per position", () => {
    const track0 = registerTakeLaneTrack({ initialLanes: 0 });
    const track1 = registerTakeLaneTrack({ initialLanes: 0, trackIndex: 1 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: "new" },
      { trackIndex: 1, arrangementStart: "2|1", takeLane: "new" },
      { trackIndex: 0, arrangementStart: "3|1", takeLane: "new" },
    ]);

    expect([...result.keys()]).toStrictEqual(["t0/l+0", "t1/l+0"]);
    // The keys alone can't catch a lost dedup — Map.set on a key that's already
    // there adds no key. The append count is what proves t0's second position
    // reused the lane its first one made.
    expect(track0.call).toHaveBeenCalledTimes(1);
    expect(track1.call).toHaveBeenCalledTimes(1);
  });

  // Two written "l+" on one track are two appends, so each gets its own lane.
  it("appends a lane per l+ when the path names several", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = resolveCreateClipTakeLanes(null, [
      {
        trackIndex: 0,
        arrangementStart: "1|1",
        takeLane: "new",
        newLaneOrdinal: 0,
      },
      {
        trackIndex: 0,
        arrangementStart: "1|1",
        takeLane: "new",
        newLaneOrdinal: 1,
      },
    ]);

    expect([...result.keys()]).toStrictEqual(["t0/l+0", "t0/l+1"]);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('targeting take lane "t0/l0"'),
    );
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('targeting take lane "t0/l1"'),
    );
  });

  // Two destinations naming different lanes on one track each get their own.
  it("keeps distinct lanes on the same track apart", () => {
    registerTakeLaneTrack({ initialLanes: 3 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: 0 },
      { trackIndex: 0, arrangementStart: "2|1", takeLane: 2 },
    ]);

    expect([...result.keys()]).toStrictEqual(["t0/l0", "t0/l2"]);
    expect(result.get("t0/l0")!.path).toBe("live_set tracks 0 take_lanes 0");
    expect(result.get("t0/l2")!.path).toBe("live_set tracks 0 take_lanes 2");
  });

  // l7 fills the track to the cap, so l+ has nowhere to go. Checking each
  // destination against the pre-call count misses that and fails mid-resolve,
  // after l7's 8 permanent lanes already exist.
  it("skips the destination that pushes one track past the cap", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: 7 },
      { trackIndex: 0, arrangementStart: "2|1", takeLane: "new" },
    ]);

    expect([...result.keys()]).toStrictEqual(["t0/l7"]);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping "t0/l+"'),
    );
  });
});
