// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import {
  setupReturnTrackNames,
  setupTrackMixerMocks,
} from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "./read-track.ts";

function expectSendsWithReverbAndSecond(
  result: Record<string, unknown>,
  secondReturn: string,
): void {
  const sends = result.sends as Record<string, unknown>[];

  expect(sends).toHaveLength(2);
  expect(sends[0]).toStrictEqual({ gainDb: -12.5, return: "Reverb" });
  expect(sends[1]).toStrictEqual({ gainDb: -6.0, return: secondReturn });
}

describe("readTrack - mixer properties", () => {
  it("excludes mixer properties by default", () => {
    setupTrackMixerMocks();

    const result = readTrack({ trackIndex: 0 });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer properties when requested", () => {
    setupTrackMixerMocks({
      volumeProperties: {
        display_value: 0,
      },
      panningProperties: {
        value: 0,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("panningMode", "stereo");
    expect(result).toHaveProperty("pan", 0);
    expect(result).not.toHaveProperty("leftPan");
    expect(result).not.toHaveProperty("rightPan");
  });

  it("includes non-zero gain and panning values", () => {
    setupTrackMixerMocks({
      volumeProperties: {
        display_value: -6.5,
      },
      panningProperties: {
        value: 0.5,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -6.5);
    expect(result).toHaveProperty("panningMode", "stereo");
    expect(result).toHaveProperty("pan", 0.5);
  });

  it("includes mixer properties for return tracks", () => {
    setupTrackMixerMocks({
      trackPath: livePath.returnTrack(0),
      trackId: "return1",
      trackProperties: {
        has_midi_input: 0,
        name: "Return Track",
      },
      volumeProperties: {
        display_value: -3,
      },
      panningProperties: {
        value: -0.5,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      category: "return",
      include: ["mixer"],
    });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("pan", -0.5);
  });

  it("includes mixer properties for master track", () => {
    setupTrackMixerMocks({
      trackPath: livePath.masterTrack(),
      trackId: "master",
      trackProperties: {
        has_midi_input: 0,
        name: "Master",
      },
      volumeProperties: {
        display_value: 0,
      },
      panningProperties: {
        value: 0,
      },
    });

    const result = readTrack({ category: "master", include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("pan", 0);
  });

  it("handles missing mixer device gracefully", () => {
    setupTrackMixerMocks({
      mixerExists: false,
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("handles missing volume parameter gracefully", () => {
    setupTrackMixerMocks({
      volumeExists: false,
      panningProperties: {
        value: 0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).toHaveProperty("pan", 0.25);
  });

  it("handles missing panning parameter gracefully", () => {
    setupTrackMixerMocks({
      panningExists: false,
      volumeProperties: {
        display_value: -12,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -12);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer with wildcard include", () => {
    setupTrackMixerMocks({
      volumeProperties: {
        display_value: 2,
      },
      panningProperties: {
        value: -0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["*"] });

    expect(result).toHaveProperty("gainDb", 2);
    expect(result).toHaveProperty("pan", -0.25);
  });

  it("returns split panning mode with leftPan and rightPan", () => {
    setupTrackMixerMocks({
      panningMode: 1,
      volumeProperties: {
        display_value: -3,
      },
      leftSplitProperties: {
        value: -1,
      },
      rightSplitProperties: {
        value: 1,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", -1);
    expect(result).toHaveProperty("rightPan", 1);
    expect(result).not.toHaveProperty("pan");
  });

  it("returns split panning mode with non-default values", () => {
    setupTrackMixerMocks({
      panningMode: 1,
      volumeProperties: {
        display_value: 0,
      },
      leftSplitProperties: {
        value: 0.25,
      },
      rightSplitProperties: {
        value: -0.5,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", 0.25);
    expect(result).toHaveProperty("rightPan", -0.5);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes sends with return track names when requested", () => {
    setupTrackMixerMocks({
      sendIds: ["send_1", "send_2"],
      sendValues: [-12.5, -6.0],
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb", "Delay"],
    });

    expect(result).toHaveProperty("sends");
    expectSendsWithReverbAndSecond(result, "Delay");
  });

  it("does not include sends property when track has no sends", () => {
    setupTrackMixerMocks({
      sendIds: [],
      sendValues: [],
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"],
    });

    expect(result).not.toHaveProperty("sends");
  });

  it("fetches return track names if not provided", () => {
    setupTrackMixerMocks({
      sendIds: ["send_1"],
      sendValues: [-10.0],
    });
    setupReturnTrackNames(["FetchedReverb"]);

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
    });

    expect(result).toHaveProperty("sends");
    const sends = result.sends as Record<string, unknown>[];

    expect(sends).toHaveLength(1);
    expect(sends[0]).toStrictEqual({
      gainDb: -10.0,
      return: "FetchedReverb",
    });
  });

  it("warns when send count doesn't match return track count", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setupTrackMixerMocks({
      sendIds: ["send_1", "send_2"],
      sendValues: [-12.5, -6.0],
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Send count (2) doesn't match return track count (1)",
    );
    expectSendsWithReverbAndSecond(result, "Return 2");

    consoleSpy.mockRestore();
  });
});
