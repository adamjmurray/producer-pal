// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tilingHelpers from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import { handleUnloopedLengthening } from "./arrangement-unlooped-helpers.ts";

const EPSILON = 0.001;

interface RunOpts {
  props: Record<string, unknown>;
  isAudioClip: boolean;
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentEndTime?: number;
  clipStartMarker: number;
  fileContentBoundary?: number;
}

/**
 * Invoke handleUnloopedLengthening with a mock clip and a spied
 * createAudioClipInSession (used by the warped-audio path).
 * @param opts - Test inputs (clip props, dispatch flags, boundary values)
 * @returns The result array, the clip.set spy, and the session-creation spy
 */
function run(opts: RunOpts) {
  const set = vi.fn();
  const clip = {
    id: "clip-1",
    getProperty: vi.fn((p: string) => opts.props[p]),
    set,
  } as unknown as LiveAPI;

  const spy = vi
    .spyOn(tilingHelpers, "createAudioClipInSession")
    .mockReturnValue({
      clip: {
        getProperty: vi.fn((p: string) =>
          p === "end_marker" ? opts.fileContentBoundary : undefined,
        ),
      } as unknown as LiveAPI,
      slot: { call: vi.fn() } as unknown as LiveAPI,
    });

  const result = handleUnloopedLengthening({
    clip,
    isAudioClip: opts.isAudioClip,
    arrangementLengthBeats: opts.arrangementLengthBeats,
    currentArrangementLength: opts.currentArrangementLength,
    currentEndTime: opts.currentEndTime ?? 0,
    clipStartMarker: opts.clipStartMarker,
    track: {} as unknown as LiveAPI,
  });

  return { result, set, spy };
}

const AUDIO_PROPS = { warping: 0, end_marker: 10, loop_start: 2, loop_end: 10 };

interface UnwarpedOpts {
  end_time: number;
  currentEndTime?: number;
  currentArrangementLength?: number;
  arrangementLengthBeats?: number;
}

/**
 * Run the unwarped-audio path with shared clip props (content length 10).
 * @param o - Per-test overrides for end_time and length parameters
 * @returns Same shape as run()
 */
function unwarped(o: UnwarpedOpts) {
  return run({
    props: { ...AUDIO_PROPS, end_time: o.end_time },
    isAudioClip: true,
    clipStartMarker: 0,
    currentEndTime: o.currentEndTime ?? 8,
    currentArrangementLength: o.currentArrangementLength ?? 8,
    arrangementLengthBeats: o.arrangementLengthBeats ?? 16,
  });
}

interface WarpedOpts {
  end_marker: number;
  clipStartMarker: number;
  fileContentBoundary: number;
  currentArrangementLength: number;
  arrangementLengthBeats: number;
}

/**
 * Run the warped-audio path (warping=1, session boundary via spy).
 * @param o - Per-test overrides for markers, boundary, and length parameters
 * @returns Same shape as run()
 */
function warped(o: WarpedOpts) {
  return run({
    props: {
      warping: 1,
      end_marker: o.end_marker,
      loop_start: 0,
      file_path: "x.wav",
    },
    isAudioClip: true,
    clipStartMarker: o.clipStartMarker,
    currentArrangementLength: o.currentArrangementLength,
    arrangementLengthBeats: o.arrangementLengthBeats,
    fileContentBoundary: o.fileContentBoundary,
  });
}

describe("handleUnloopedLengthening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("MIDI clip", () => {
    it("does not extend end_marker when targetEndMarker equals currentEndMarker", () => {
      // clipStartMarker(0) + arrangementLengthBeats(8) == currentEndMarker(8)
      const { result, set } = run({
        props: { end_marker: 8, loop_start: 0 },
        isAudioClip: false,
        arrangementLengthBeats: 8,
        currentArrangementLength: 0,
        clipStartMarker: 0,
      });

      expect(set).not.toHaveBeenCalledWith("end_marker", expect.anything());
      expect(set).toHaveBeenCalledWith("loop_end", 8); // loop_start(0) + 8
      expect(result).toStrictEqual([{ id: "clip-1" }]);
    });

    it("extends end_marker and loop_end when target exceeds current", () => {
      // targetEndMarker = 0 + 8 = 8 > currentEndMarker(4)
      const { result, set } = run({
        props: { end_marker: 4, loop_start: 2 },
        isAudioClip: false,
        arrangementLengthBeats: 8,
        currentArrangementLength: 0,
        clipStartMarker: 0,
      });

      expect(set).toHaveBeenCalledWith("end_marker", 8);
      expect(set).toHaveBeenCalledWith("loop_end", 10); // loop_start(2) + 8
      expect(result).toStrictEqual([{ id: "clip-1" }]);
    });
  });

  describe("audio clip content-length gate", () => {
    it("returns early without lengthening when content length is zero", () => {
      // contentLength = end_marker(4) - clipStartMarker(4) = 0 <= EPSILON
      const { result, set, spy } = run({
        props: { warping: 1, end_marker: 4, loop_start: 0, file_path: "x.wav" },
        isAudioClip: true,
        arrangementLengthBeats: 16,
        currentArrangementLength: 8,
        clipStartMarker: 4,
        fileContentBoundary: 99,
      });

      expect(spy).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalledWith("loop_end", expect.anything());
      expect(result).toStrictEqual([{ id: "clip-1" }]);
    });

    it("returns early when content length exactly equals EPSILON", () => {
      // contentLength = EPSILON; `<= EPSILON` is true, `< EPSILON` would be false
      const { result, spy } = run({
        props: {
          warping: 1,
          end_marker: EPSILON,
          loop_start: 0,
          file_path: "x.wav",
        },
        isAudioClip: true,
        arrangementLengthBeats: 16,
        currentArrangementLength: 8,
        clipStartMarker: 0,
        fileContentBoundary: 99,
      });

      expect(spy).not.toHaveBeenCalled();
      expect(result).toStrictEqual([{ id: "clip-1" }]);
    });
  });

  describe("warped unlooped audio", () => {
    it("caps loop_end at the file content boundary and warns", () => {
      // totalContentFromStart = 20 - 4 = 16, capped below requested 100
      const { set } = warped({
        end_marker: 20,
        clipStartMarker: 4,
        fileContentBoundary: 20,
        currentArrangementLength: 8,
        arrangementLengthBeats: 100,
      });

      expect(set).toHaveBeenCalledWith("loop_end", 16); // loop_start(0) + 16
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("capped at file content boundary"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("beats available"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("requested"),
      );
    });

    it("warns and skips when no additional content is available", () => {
      // totalContentFromStart(8) == currentArrangementLength(8)
      const { set } = warped({
        end_marker: 12,
        clipStartMarker: 4,
        fileContentBoundary: 12,
        currentArrangementLength: 8,
        arrangementLengthBeats: 50,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Cannot lengthen unlooped audio clip"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("beats available"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("currently shown"),
      );
      expect(set).not.toHaveBeenCalledWith("loop_end", expect.anything());
    });

    it("skips at the exact no-content boundary (content == current + EPSILON)", () => {
      // totalContentFromStart == currentArrangementLength + EPSILON
      const { set } = warped({
        end_marker: 10,
        clipStartMarker: 0,
        fileContentBoundary: 8 + EPSILON,
        currentArrangementLength: 8,
        arrangementLengthBeats: 50,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("no additional file content"),
      );
      expect(set).not.toHaveBeenCalledWith("loop_end", expect.anything());
    });

    it("does not warn when the full requested length is achievable", () => {
      // effectiveTarget(16) == arrangementLengthBeats(16), no cap warning
      const { set } = warped({
        end_marker: 30,
        clipStartMarker: 0,
        fileContentBoundary: 30,
        currentArrangementLength: 8,
        arrangementLengthBeats: 16,
      });

      expect(set).toHaveBeenCalledWith("loop_end", 16);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("does not warn at the exact cap boundary (target == requested - EPSILON)", () => {
      // effectiveTarget == arrangementLengthBeats - EPSILON; `<` is false there
      const { set } = warped({
        end_marker: 16,
        clipStartMarker: 0,
        fileContentBoundary: 16 - EPSILON,
        currentArrangementLength: 4,
        arrangementLengthBeats: 16,
      });

      expect(set).toHaveBeenCalledWith("loop_end", 16 - EPSILON);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("does not extend end_marker when target equals current end_marker", () => {
      // targetEndMarker = clipStartMarker(4) + effectiveTarget(16) == currentEndMarker(20)
      const { set } = warped({
        end_marker: 20,
        clipStartMarker: 4,
        fileContentBoundary: 20,
        currentArrangementLength: 8,
        arrangementLengthBeats: 16,
      });

      expect(set).toHaveBeenCalledWith("loop_end", 16);
      expect(set).not.toHaveBeenCalledWith("end_marker", expect.anything());
    });
  });

  describe("unwarped unlooped audio", () => {
    it("sets loop_end derived from the current beats-per-second ratio", () => {
      // currentDurationSec = loop_end(10) - loop_start(2) = 8; bps = 8/8 = 1
      // targetDurationSec = 16/1 = 16; targetLoopEnd = loop_start(2) + 16 = 18
      const { set } = unwarped({ end_time: 24 });

      expect(set).toHaveBeenCalledWith("loop_end", 18);
    });

    it("warns at the file boundary when no additional length is achieved", () => {
      // actualArrangementLength == currentArrangementLength(8)
      unwarped({ end_time: 8 });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Cannot lengthen unlooped audio clip"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("at file boundary"),
      );
    });

    it("warns at the exact no-content boundary (actual == current + EPSILON)", () => {
      // actualArrangementLength == currentArrangementLength + EPSILON
      unwarped({ end_time: 8 + EPSILON });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Cannot lengthen unlooped audio clip"),
      );
    });

    it("warns that the clip was capped when it falls short of the request", () => {
      // actual(12) is between current(8) and requested(16)
      unwarped({ end_time: 12 });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("capped at file content boundary"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("beats achieved"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("requested"),
      );
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("Cannot lengthen"),
      );
    });

    it("does not warn when the requested length is fully achieved", () => {
      // actualArrangementLength(16) == requested(16)
      unwarped({ end_time: 16 });

      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("does not warn at the exact cap boundary (actual == requested - EPSILON)", () => {
      // actualArrangementLength == arrangementLengthBeats - EPSILON; `<` is false
      unwarped({ end_time: 16 - EPSILON });

      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("computes clip start time by subtracting current length from end time", () => {
      // clipStartTime = currentEndTime(12) - current(8) = 4; actual = 20 - 4 = 16 -> capped
      unwarped({
        end_time: 20,
        currentEndTime: 12,
        arrangementLengthBeats: 100,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("capped at file content boundary"),
      );
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("at file boundary"),
      );
    });

    it("computes achieved length by subtracting start time from new end time", () => {
      // clipStartTime = 10 - 8 = 2; actual = 18 - 2 = 16 -> capped below requested 18
      unwarped({
        end_time: 18,
        currentEndTime: 10,
        arrangementLengthBeats: 18,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("capped at file content boundary"),
      );
    });
  });
});
