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
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/take-lane-test-helpers.ts";

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
function registerEmptySessionSlot(): void {
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
    // result surfaces the lane the clip landed on, as a path
    expect(result.path).toBe("t0/l0");
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
    expect(result.path).toBe("t0/l0");
  });

  it("warns and ignores takeLane for session-only requests", async () => {
    registerEmptySessionSlot();

    await createClip({ slot: "0/0", notes: "C3", takeLane: "new" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLane ignored for session clips"),
    );
  });

  it("warns-and-ignores an invalid takeLane for session-only requests (does not throw)", async () => {
    registerEmptySessionSlot();

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
    // A request targeting BOTH an arrangement position and a session slot: the
    // takeLane applies to the arrangement clip but must be flagged as ignored
    // for the accompanying session slot.
    registerEmptySessionSlot();
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
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
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

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(2))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 4, 4);
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

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(2))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('takeLane ignored — "path" already names'),
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

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(1))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 4);
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

    expect(result.get("t0/l+")).toBeDefined();
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('targeting take lane "t0/l0"'),
    );
  });

  // Resolving per position rather than per destination would hand a track with
  // two positions two different "new" lanes, splitting one request across them.
  it("resolves one lane per destination, not per position", () => {
    registerTakeLaneTrack({ initialLanes: 0 });
    registerTakeLaneTrack({ initialLanes: 0, trackIndex: 1 });

    const result = resolveCreateClipTakeLanes(null, [
      { trackIndex: 0, arrangementStart: "1|1", takeLane: "new" },
      { trackIndex: 1, arrangementStart: "2|1", takeLane: "new" },
      { trackIndex: 0, arrangementStart: "3|1", takeLane: "new" },
    ]);

    expect([...result.keys()]).toStrictEqual(["t0/l+", "t1/l+"]);
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
  // destination against the pre-call count misses that and throws mid-resolve,
  // stranding l7's 8 permanent lanes and creating no clips.
  it("creates no lane when two destinations on one track exceed the cap together", () => {
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    expect(() =>
      resolveCreateClipTakeLanes(null, [
        { trackIndex: 0, arrangementStart: "1|1", takeLane: 7 },
        { trackIndex: 0, arrangementStart: "2|1", takeLane: "new" },
      ]),
    ).toThrow(/take lane limit/);
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });
});
