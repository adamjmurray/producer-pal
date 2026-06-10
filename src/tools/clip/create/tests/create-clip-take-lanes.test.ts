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
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { createClip } from "#src/tools/clip/create/create-clip.ts";
import * as consoleMock from "#src/shared/v8-max-console.ts";

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
    })) as { id: string; takeLane?: number };

    expect(track.call).toHaveBeenCalledWith("create_take_lane");
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );

    const lane = lookupMockObject(undefined, livePath.track(0).takeLane(0));

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(result.id).toMatch(/^tl_clip_/);
    // result surfaces the 1-based lane the clip landed on
    expect(result.takeLane).toBe(1);
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
    })) as { id: string; takeLane?: number };

    // No overlap guard: the clip is created on the targeted lane regardless
    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(result.takeLane).toBe(1);
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
});
