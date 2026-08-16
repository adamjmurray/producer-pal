// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateBarBeatPosition } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  buildClipResultObject,
  emitArrangementWarnings,
  prepareSessionClipSlot,
  validateAndParseArrangementParams,
} from "./clip-result-helpers.ts";

// Mock dependencies
vi.mock(import("#src/notation/barbeat/time/barbeat-time.ts"), () => ({
  barBeatToAbletonBeats: vi.fn((pos) => {
    // Simple mock: "1|1" = 0, "2|1" = 4
    if (pos === "1|1") return 0;
    if (pos === "2|1") return 4;

    return 0;
  }),
  durationToAbletonBeats: vi.fn((dur) => {
    // Simple mock: "1bar" = 4 beats, "1/2" = 2 beats, "0bar" = 0, "-1bar" = -4
    if (dur === "1bar") return 4;
    if (dur === "1/2") return 2;
    if (dur === "0bar") return 0;
    if (dur === "-1bar") return -4;

    return 0;
  }),
  // No-op by default (valid positions pass); a single test overrides it to
  // throw, exercising the wiring. The real accept/reject parity is covered in
  // barbeat-position-validation.test.ts.
  validateBarBeatPosition: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

import * as console from "#src/shared/max/v8-max-console.ts";

describe("clip-result-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
  });

  describe("validateAndParseArrangementParams", () => {
    it("returns null values when both params are undefined", () => {
      const result = validateAndParseArrangementParams(undefined, undefined);

      expect(result.songTimeSigNumerator).toBeNull();
      expect(result.songTimeSigDenominator).toBeNull();
      expect(result.arrangementStartBeats).toBeNull();
      expect(result.arrangementLengthBeats).toBeNull();
    });

    it("parses arrangementStart when provided", () => {
      const result = validateAndParseArrangementParams("2|1", undefined);

      expect(result.songTimeSigNumerator).toBe(4);
      expect(result.songTimeSigDenominator).toBe(4);
      expect(result.arrangementStartBeats).toBe(4);
      expect(result.arrangementLengthBeats).toBeNull();
    });

    it("parses arrangementLength when provided", () => {
      const result = validateAndParseArrangementParams(undefined, "1bar");

      expect(result.songTimeSigNumerator).toBe(4);
      expect(result.songTimeSigDenominator).toBe(4);
      expect(result.arrangementStartBeats).toBeNull();
      expect(result.arrangementLengthBeats).toBe(4);
    });

    it("parses both params when provided", () => {
      const result = validateAndParseArrangementParams("1|1", "1/2");

      expect(result.arrangementStartBeats).toBe(0);
      expect(result.arrangementLengthBeats).toBe(2);
    });

    it("throws when arrangementLength is zero", () => {
      expect(() =>
        validateAndParseArrangementParams(undefined, "0bar"),
      ).toThrow("arrangementLength must be greater than 0");
    });

    it("throws when arrangementLength is negative", () => {
      expect(() =>
        validateAndParseArrangementParams(undefined, "-1bar"),
      ).toThrow("arrangementLength must be greater than 0");
    });

    it("rejects a 0-indexed arrangementStart with the 1-indexing steer", () => {
      // Parity with create-clip: validateAndParseArrangementParams runs the
      // 1-indexing guard on arrangementStart, so a steer thrown there propagates
      // rather than resolving to a silent pre-origin beat.
      vi.mocked(validateBarBeatPosition).mockImplementationOnce(() => {
        throw new Error("beats are 1-indexed");
      });

      expect(() => validateAndParseArrangementParams("1|0", undefined)).toThrow(
        /1-indexed/,
      );
    });
  });

  describe("buildClipResultObject", () => {
    it("returns object with only id when noteResult is null", () => {
      const result = buildClipResultObject("clip123", null);

      expect(result).toStrictEqual({ id: "clip123" });
      expect(result.noteCount).toBeUndefined();
    });

    it("returns object with id and noteCount when noteResult is provided", () => {
      const result = buildClipResultObject("clip456", { noteCount: 42 });

      expect(result).toStrictEqual({ id: "clip456", noteCount: 42 });
    });

    it("includes noteCount of 0 when explicitly provided", () => {
      const result = buildClipResultObject("clip789", { noteCount: 0 });

      expect(result).toStrictEqual({ id: "clip789", noteCount: 0 });
    });

    it("includes transformed when provided in noteResult", () => {
      const result = buildClipResultObject("clip100", {
        noteCount: 10,
        transformed: 5,
      });

      expect(result).toStrictEqual({
        id: "clip100",
        noteCount: 10,
        transformed: 5,
      });
    });

    it("omits transformed when undefined in noteResult", () => {
      const result = buildClipResultObject("clip200", { noteCount: 8 });

      expect(result).toStrictEqual({ id: "clip200", noteCount: 8 });
      expect(result.transformed).toBeUndefined();
    });

    it("includes the slot path when a slot is provided", () => {
      const result = buildClipResultObject("clip300", null, {
        trackIndex: 0,
        sceneIndex: 3,
      });

      expect(result).toStrictEqual({ id: "clip300", path: "t0/s3" });
    });
  });

  describe("emitArrangementWarnings", () => {
    it("does nothing when arrangementStartBeats is null", () => {
      const tracksWithMovedClips = new Map([[0, 3]]);

      emitArrangementWarnings(null, tracksWithMovedClips);

      expect(console.error).not.toHaveBeenCalled();
    });

    it("emits no warning when arrangementStartBeats is null even with an overlapping track", () => {
      // The early return must fire: a track with 3 clips would otherwise warn.
      // Guards the `if (arrangementStartBeats == null) return` block and branch.
      emitArrangementWarnings(null, new Map([[0, 3]]));

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("does nothing when no track has more than 1 clip", () => {
      const tracksWithMovedClips = new Map([
        [0, 1],
        [1, 1],
      ]);

      emitArrangementWarnings(0, tracksWithMovedClips);

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("emits warning when track has more than 1 clip", () => {
      const tracksWithMovedClips = new Map([[0, 3]]);

      emitArrangementWarnings(0, tracksWithMovedClips);

      expect(console.warn).toHaveBeenCalledWith(
        "3 clips on track 0 moved to the same position - later clips will overwrite earlier ones",
      );
    });

    it("emits warnings for multiple tracks with overlapping clips", () => {
      const tracksWithMovedClips = new Map([
        [0, 2],
        [1, 1],
        [2, 4],
      ]);

      emitArrangementWarnings(4, tracksWithMovedClips);

      expect(console.warn).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalledWith(
        "2 clips on track 0 moved to the same position - later clips will overwrite earlier ones",
      );
      expect(console.warn).toHaveBeenCalledWith(
        "4 clips on track 2 moved to the same position - later clips will overwrite earlier ones",
      );
    });
  });

  describe("prepareSessionClipSlot", () => {
    function registerLiveSet(sceneCount: number): void {
      const scenes: (string | number)[] = [];

      for (let i = 0; i < sceneCount; i++) {
        scenes.push("id", i + 1);
      }

      registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes },
      });
    }

    it("throws at the boundary sceneIndex === maxAutoCreatedScenes", () => {
      // 1000 >= 1000 must throw. A `>` mutant (strict) would fall through at the
      // exact boundary; the message pins both the blanked-string and the
      // `MAX_AUTO_CREATED_SCENES - 1` (=999) arithmetic mutants.
      registerLiveSet(3);

      expect(() =>
        prepareSessionClipSlot(0, 1000, LiveAPI.from(livePath.liveSet), 1000),
      ).toThrow("sceneIndex 1000 exceeds the maximum allowed value of 999");
    });

    it("does not auto-create scenes when the slot already exists", () => {
      // sceneIndex 1 < currentSceneCount 3 → no scenes created; the slot is empty.
      const liveSet = registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes: ["id", 1, "id", 2, "id", 3] },
      });

      registerMockObject(livePath.track(0).clipSlot(1), {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: 0 },
      });

      const slot = prepareSessionClipSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
        1000,
      );

      expect(liveSet.call).not.toHaveBeenCalledWith("create_scene", -1);
      expect(slot.path).toBe(String(livePath.track(0).clipSlot(1)));
    });

    it("throws when a clip already exists in the target slot", () => {
      registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes: ["id", 1, "id", 2, "id", 3] },
      });
      registerMockObject(livePath.track(0).clipSlot(1), {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: 1 },
      });

      expect(() =>
        prepareSessionClipSlot(0, 1, LiveAPI.from(livePath.liveSet), 1000),
      ).toThrow("a clip already exists at track 0, clip slot 1");
    });
  });
});
