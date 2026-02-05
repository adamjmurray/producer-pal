// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  setupArrangementClipMocks,
  setupNoClipsInArrangementMocks,
  setupNonExistentTrackMocks,
} from "./transform-clips-arrangement-test-helpers.ts";
import { setupClipMocks } from "./transform-clips-test-helpers.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";

describe("transformClips - arrangement", () => {
  it("should accept arrangementTrackIndex with arrangementStart/Length instead of clipIds", () => {
    setupArrangementClipMocks([
      { id: "clip_1", startTime: 0.0 }, // At bar 1
      { id: "clip_2", startTime: 8.0 }, // At bar 3
    ]);

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // 4 bars = 16 beats, so range is [0, 16)
    // clip_1 at 0.0 and clip_2 at 8.0 are both in range
    expect(result.clipIds).toStrictEqual(["clip_1", "clip_2"]);
  });

  it("should prioritize clipIds over arrangementTrackIndex when both provided", () => {
    setupClipMocks("clip_1");

    const result = transformClips({
      clipIds: "clip_1",
      arrangementTrackIndex: "0", // Should be ignored
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result.clipIds).toStrictEqual(["clip_1"]);
  });

  it("should filter clips by start_time in arrangement range", () => {
    setupArrangementClipMocks([
      { id: "clip_1", startTime: 0.0 }, // Bar 1
      { id: "clip_2", startTime: 4.0 }, // Bar 2
      { id: "clip_3", startTime: 16.0 }, // Bar 5 (outside range)
    ]);

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    // Should include clips starting at 0.0 and 4.0, but not 16.0
    expect(result.clipIds).toStrictEqual(["clip_1", "clip_2"]);
  });

  it("should warn when no clips found in arrangement range", () => {
    setupNoClipsInArrangementMocks(0);

    const result = transformClips({
      arrangementTrackIndex: "0",
      arrangementStart: "1|1.0",
      arrangementLength: "4:0.0",
      seed: 12345,
    });

    expect(result).toStrictEqual({ clipIds: [], seed: 12345 });
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("no clips found in arrangement range"),
    );
  });

  it("should throw error when arrangementLength is zero", () => {
    setupNoClipsInArrangementMocks(0);

    expect(() =>
      transformClips({
        arrangementTrackIndex: "0",
        arrangementStart: "1|1.0",
        arrangementLength: "0:0.0", // Zero length
        seed: 12345,
      }),
    ).toThrow("arrangementLength must be greater than 0");
  });

  it("should throw error when track does not exist", () => {
    setupNonExistentTrackMocks(99);

    expect(() =>
      transformClips({
        arrangementTrackIndex: "99",
        arrangementStart: "1|1.0",
        seed: 12345,
      }),
    ).toThrow("transformClips failed: track 99 not found");
  });
});
