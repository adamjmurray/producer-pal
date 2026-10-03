// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { validateArrangementPositions } from "#src/tools/clip/create/helpers/clip-timing-context.ts";
import { registerArrangementTrack } from "../create-clip-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

const PAST_CAP =
  "arrangementStart is past the last position Live allows (394201|1)";

/** Register the live_set time signature mock used by createClip. */
function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

describe("validateArrangementPositions", () => {
  const at = (arrangementStart: string) => [
    { trackIndex: 0, takeLane: null, arrangementStart },
  ];

  it("allows the last position Live takes", () => {
    expect(() =>
      validateArrangementPositions(at("394201|1"), 4, 4),
    ).not.toThrow();
  });

  it("refuses the first position past it, in bar|beat", () => {
    expect(() => validateArrangementPositions(at("394201|2"), 4, 4)).toThrow(
      PAST_CAP,
    );
  });

  it("states the last position in the song's meter", () => {
    // 1,576,800 beats is 262,800 bars of 6/4
    expect(MAX_ARRANGEMENT_POSITION_BEATS / 6).toBe(262_800);
    expect(() => validateArrangementPositions(at("262802|1"), 6, 4)).toThrow(
      "(262801|1)",
    );
  });
});

describe("createClip - arrangement positions past the last Live allows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a MIDI clip before creating anything", async () => {
    registerLiveSet();
    const track = registerArrangementTrack(0);

    await expect(
      createClip({ path: "t0", arrangementStart: "394202|1", notes: "C3 1|1" }),
    ).rejects.toThrow(PAST_CAP);

    expect(track.call).not.toHaveBeenCalled();
  });

  it("refuses an audio clip before creating anything", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    await expect(
      createClip({
        path: "t0",
        arrangementStart: "394202|1",
        sampleFile: "/samples/loop.wav",
      }),
    ).rejects.toThrow(PAST_CAP);

    expect(track.call).not.toHaveBeenCalled();
  });

  it("creates no clip on any destination when the last position is past it", async () => {
    registerLiveSet();
    const first = registerArrangementTrack(0);
    const second = registerArrangementTrack(1);

    await expect(
      createClip({
        path: "t0,t1",
        arrangementStart: "1|1,394202|1",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow(PAST_CAP);

    expect(first.call).not.toHaveBeenCalled();
    expect(second.call).not.toHaveBeenCalled();
  });

  it("makes no take lane for an earlier destination when a later one is past it", async () => {
    registerLiveSet();
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    await expect(
      createClip({
        path: "t0/l0[1|1],t0/l0[394202|1]",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow(PAST_CAP);

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it("still creates a clip at the last position Live takes", async () => {
    registerLiveSet();
    const track = registerArrangementTrack(0);

    await createClip({
      path: "t0",
      arrangementStart: "394201|1",
      notes: "C3 1|1",
    });

    expect(track.call).toHaveBeenCalledWith(
      "create_midi_clip",
      MAX_ARRANGEMENT_POSITION_BEATS,
      expect.anything(),
    );
  });
});
