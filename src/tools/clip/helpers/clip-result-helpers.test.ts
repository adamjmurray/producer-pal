import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClipResultObject,
  emitArrangementWarnings,
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
  barBeatDurationToAbletonBeats: vi.fn((dur) => {
    // Simple mock: "1:0" = 4 beats, "0:2" = 2 beats, "0:0" = 0
    if (dur === "1:0") return 4;
    if (dur === "0:2") return 2;
    if (dur === "0:0") return 0;
    if (dur === "-1:0") return -4;

    return 0;
  }),
}));

vi.mock(import("#src/tools/shared/live-set-helpers.ts"), () => ({
  parseSongTimeSignature: vi.fn(() => ({
    numerator: 4,
    denominator: 4,
  })),
}));

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

import * as console from "#src/shared/v8-max-console.ts";

describe("clip-result-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const result = validateAndParseArrangementParams(undefined, "1:0");

      expect(result.songTimeSigNumerator).toBe(4);
      expect(result.songTimeSigDenominator).toBe(4);
      expect(result.arrangementStartBeats).toBeNull();
      expect(result.arrangementLengthBeats).toBe(4);
    });

    it("parses both params when provided", () => {
      const result = validateAndParseArrangementParams("1|1", "0:2");

      expect(result.arrangementStartBeats).toBe(0);
      expect(result.arrangementLengthBeats).toBe(2);
    });

    it("throws when arrangementLength is zero", () => {
      expect(() => validateAndParseArrangementParams(undefined, "0:0")).toThrow(
        "arrangementLength must be greater than 0",
      );
    });

    it("throws when arrangementLength is negative", () => {
      expect(() =>
        validateAndParseArrangementParams(undefined, "-1:0"),
      ).toThrow("arrangementLength must be greater than 0");
    });
  });

  describe("buildClipResultObject", () => {
    it("returns object with only id when noteCount is null", () => {
      const result = buildClipResultObject("clip123", null);

      expect(result).toStrictEqual({ id: "clip123" });
      expect(result.noteCount).toBeUndefined();
    });

    it("returns object with id and noteCount when noteCount is provided", () => {
      const result = buildClipResultObject("clip456", 42);

      expect(result).toStrictEqual({ id: "clip456", noteCount: 42 });
    });

    it("includes noteCount of 0 when explicitly provided", () => {
      const result = buildClipResultObject("clip789", 0);

      expect(result).toStrictEqual({ id: "clip789", noteCount: 0 });
    });
  });

  describe("emitArrangementWarnings", () => {
    it("does nothing when arrangementStartBeats is null", () => {
      const tracksWithMovedClips = new Map([[0, 3]]);

      emitArrangementWarnings(null, tracksWithMovedClips);

      expect(console.error).not.toHaveBeenCalled();
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
});
