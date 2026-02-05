// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";
import {
  setupClipMocks,
  setupSessionClipMocks,
} from "./transform-clips-test-helpers.ts";

describe("transformClips - basic", () => {
  it("should throw error when clipIds and arrangementTrackIndex are missing", () => {
    expect(() => transformClips()).toThrow(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
    expect(() => transformClips({})).toThrow(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
  });

  it("should return clipIds and seed when provided valid clips", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);

    const result = transformClips({ clipIds: clipId, seed: 12345 });

    expect(result).toStrictEqual({ clipIds: [clipId], seed: 12345 });
  });

  it("should generate seed from Date.now() when not provided", () => {
    const clipId = "clip_1";

    setupClipMocks(clipId);

    const result = transformClips({ clipIds: clipId });

    expect(result).toHaveProperty("clipIds");
    expect(result).toHaveProperty("seed");
    expect(typeof result.seed).toBe("number");
    expect(result.seed).toBeGreaterThan(0);
  });

  it("should handle comma-separated clip IDs", () => {
    setupSessionClipMocks(["clip_1", "clip_2", "clip_3"]);

    const result = transformClips({
      clipIds: "clip_1,clip_2,clip_3",
      seed: 12345,
    });

    expect(result.clipIds).toStrictEqual(["clip_1", "clip_2", "clip_3"]);
  });
});
