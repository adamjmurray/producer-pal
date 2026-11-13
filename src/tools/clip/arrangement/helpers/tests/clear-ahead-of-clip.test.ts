// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The temp clip that clears a lengthening clip's way goes on every path, and a
// delete Live refuses is said, not thrown.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  overrideCall,
  requireMockObject,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import * as arrangementTilingHelpers from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { setupArrangementClipPath } from "../arrangement-length-changes-test-helpers.ts";
import { clearAheadOfClip } from "../clear-ahead-of-clip.ts";

const REFUSED = "Live refused delete_clip";

type MockTrack = ReturnType<typeof requireMockObject>;

/**
 * A lane view that finds `inTheWay` clips over any span.
 * @param inTheWay - How many clips it finds
 * @returns The stub view
 */
function lanesWith(inTheWay: number): LaneView {
  return {
    overlapping: vi.fn(() =>
      Array.from({ length: inTheWay }, (_, i) => ({ id: `n${i}` })),
    ),
    wroteOnTrack: vi.fn(),
  } as unknown as LaneView;
}

interface ClearOptions {
  isAudioClip?: boolean;
  lanes?: LaneView;
  reportScratch?: (message: string) => void;
}

/**
 * Clear beats 8–16 on track 0.
 * @param options - Clear options
 * @param options.isAudioClip - Whether the track holds audio
 * @param options.lanes - The lane view to clear with
 * @param options.reportScratch - Told what couldn't be removed
 */
function clear({
  isAudioClip = false,
  lanes = lanesWith(1),
  reportScratch = vi.fn(),
}: ClearOptions = {}): void {
  clearAheadOfClip({
    track: requireMockObject(livePath.track(0)) as unknown as LiveAPI,
    isAudioClip,
    from: 8,
    to: 16,
    context: { silenceWavPath: "/test.wav", lanes },
    reportScratch,
  });
}

/**
 * Track 0, answering `create_midi_clip` and `duplicate_clip_to_arrangement`
 * with a temp clip.
 * @param deleteThrows - Whether Track.delete_clip throws
 * @returns The mock track
 */
function tempClipTrack(deleteThrows = false): MockTrack {
  setupArrangementClipPath("789");
  registerMockObject("arr-456", {
    path: livePath.track(0).arrangementClip(1),
    type: "Clip",
  });

  const track = requireMockObject(livePath.track(0));

  overrideCall(track, (method: string) => {
    if (method === "create_midi_clip") {
      return "id 789-temp";
    }

    if (method === "duplicate_clip_to_arrangement") {
      return "id arr-456";
    }

    if (method === "delete_clip" && deleteThrows) {
      throw new Error(REFUSED);
    }

    return USE_CALL_FALLBACK;
  });

  return track;
}

describe("clearAheadOfClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("lays a MIDI temp clip over the span, then deletes it", () => {
    const track = tempClipTrack();
    const lanes = lanesWith(1);

    clear({ lanes });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 8);
    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 789-temp");
    expect(lanes.wroteOnTrack).toHaveBeenCalledWith(expect.anything(), 8, 16);
  });

  it("lays nothing when the span is empty", () => {
    const track = tempClipTrack();

    clear({ lanes: lanesWith(0) });

    expect(track.call).not.toHaveBeenCalled();
  });

  it("lays nothing for a span of no length", () => {
    const track = tempClipTrack();

    clearAheadOfClip({
      track: track as unknown as LiveAPI,
      isAudioClip: false,
      from: 8,
      to: 8,
      context: { lanes: lanesWith(1) },
      reportScratch: vi.fn(),
    });

    expect(track.call).not.toHaveBeenCalled();
  });

  it("says a refused MIDI delete without throwing", () => {
    tempClipTrack(true);
    const reportScratch = vi.fn();

    expect(() => clear({ reportScratch })).not.toThrow();
    expect(reportScratch).toHaveBeenCalledWith(
      `couldn't remove the temp arrangement clip (${REFUSED})`,
    );
  });

  it("throws when Live made no MIDI clip", () => {
    setupArrangementClipPath("789");
    overrideCall(requireMockObject(livePath.track(0)), (method: string) =>
      method === "create_midi_clip" ? "id 1" : USE_CALL_FALLBACK,
    );

    expect(() => clear()).toThrow(/Live created no clip/);
  });

  it("hands an audio span to the shared temp clip, removed without throwing", () => {
    const track = tempClipTrack(true);
    const reportScratch = vi.fn();
    const shared = vi
      .spyOn(arrangementTilingHelpers, "createAndDeleteTempClip")
      .mockImplementation((...args) => args[5]?.("arr-456"));

    expect(() => clear({ isAudioClip: true, reportScratch })).not.toThrow();
    expect(shared).toHaveBeenCalledWith(
      track,
      8,
      8,
      false,
      expect.objectContaining({ silenceWavPath: "/test.wav" }),
      expect.any(Function),
    );
    expect(reportScratch).toHaveBeenCalledWith(
      `couldn't remove the temp arrangement clip (${REFUSED})`,
    );
  });
});
