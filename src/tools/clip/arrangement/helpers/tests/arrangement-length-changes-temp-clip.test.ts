// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The temp clip that cuts a clip short goes on every path, and a delete Live
// refuses is said, not thrown over the cut it follows.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  overrideCall,
  requireMockObject,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as arrangementTilingHelpers from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { setupArrangementClipPath } from "../arrangement-length-changes-test-helpers.ts";
import { handleArrangementShortening } from "../arrangement-length-changes.ts";

const REFUSED = "Live refused delete_clip";

interface Setup {
  track: ReturnType<typeof requireMockObject>;
  sessionSlotCall: ReturnType<typeof vi.fn>;
  arrangementClip: ReturnType<typeof registerMockObject>;
}

/**
 * An audio shortening where the copy lands as clip "arr-456".
 * @param deleteThrows - Whether Track.delete_clip throws
 * @returns The mock track, the session slot's call and the temp clip
 */
function setUpAudio(deleteThrows = false): Setup {
  setupArrangementClipPath("789");

  const track = requireMockObject(livePath.track(0));
  const arrangementClip = registerMockObject("arr-456", {
    path: livePath.track(0).arrangementClip(1),
    type: "Clip",
  });
  const sessionSlotCall = vi.fn();

  vi.spyOn(
    arrangementTilingHelpers,
    "createAudioClipInSession",
  ).mockReturnValue({
    clip: { id: "session-123" } as unknown as LiveAPI,
    slot: { call: sessionSlotCall } as unknown as LiveAPI,
  });
  overrideCall(track, (method: string) => {
    if (method === "duplicate_clip_to_arrangement") {
      return "id arr-456";
    }

    if (method === "delete_clip" && deleteThrows) {
      throw new Error(REFUSED);
    }

    return USE_CALL_FALLBACK;
  });

  return { track, sessionSlotCall, arrangementClip };
}

/**
 * Shorten the clip, as clip "789" on track 0.
 * @param isAudioClip - Whether it is an audio clip
 * @param extra - Callbacks to pass along
 * @param extra.onCut - Told once the clip is cut
 * @param extra.reportScratch - Told what couldn't be removed
 */
function shorten(
  isAudioClip: boolean,
  extra: { onCut?: () => void; reportScratch?: (message: string) => void } = {},
): void {
  handleArrangementShortening({
    clip: { id: "789", trackIndex: 0 } as unknown as LiveAPI,
    isAudioClip,
    arrangementLengthBeats: 4,
    currentStartTime: 0,
    currentEndTime: 8,
    context: { silenceWavPath: "/test.wav" },
    ...extra,
  });
}

describe("the temp clip that shortens an arrangement clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("is deleted when setting up the audio copy throws", () => {
    const { track, sessionSlotCall, arrangementClip } = setUpAudio();
    const onCut = vi.fn();

    arrangementClip.set.mockImplementation(() => {
      throw new Error("warping refused");
    });

    expect(() => shorten(true, { onCut })).toThrow("warping refused");

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id arr-456");
    expect(sessionSlotCall).toHaveBeenCalledWith("delete_clip");
    // The copy had already cut the clip.
    expect(onCut).toHaveBeenCalledTimes(1);
  });

  it("keeps the setup error when the delete after it fails too", () => {
    const { arrangementClip } = setUpAudio(true);
    const reportScratch = vi.fn();

    arrangementClip.set.mockImplementation(() => {
      throw new Error("warping refused");
    });

    expect(() => shorten(true, { reportScratch })).toThrow("warping refused");

    expect(reportScratch).toHaveBeenCalledWith(
      `couldn't remove the temp arrangement clip (${REFUSED})`,
    );
  });

  it("says a refused audio delete and still finishes the cut", () => {
    const { sessionSlotCall } = setUpAudio(true);
    const onCut = vi.fn();
    const reportScratch = vi.fn();

    expect(() => shorten(true, { onCut, reportScratch })).not.toThrow();

    expect(reportScratch).toHaveBeenCalledWith(
      `couldn't remove the temp arrangement clip (${REFUSED})`,
    );
    expect(onCut).toHaveBeenCalledTimes(1);
    // The session clip still goes.
    expect(sessionSlotCall).toHaveBeenCalledWith("delete_clip");
  });

  it("says a refused MIDI delete and still finishes the cut", () => {
    setupArrangementClipPath("789");

    const track = requireMockObject(livePath.track(0));
    const onCut = vi.fn();
    const reportScratch = vi.fn();

    overrideCall(track, (method: string) => {
      if (method === "create_midi_clip") {
        return "id 789-temp";
      }

      if (method === "delete_clip") {
        throw new Error(REFUSED);
      }

      return USE_CALL_FALLBACK;
    });

    expect(() => shorten(false, { onCut, reportScratch })).not.toThrow();

    expect(reportScratch).toHaveBeenCalledWith(
      `couldn't remove the temp arrangement clip (${REFUSED})`,
    );
    expect(onCut).toHaveBeenCalledTimes(1);
  });

  it("is not reported as a cut when Live made no MIDI clip", () => {
    setupArrangementClipPath("789");

    const track = requireMockObject(livePath.track(0));
    const onCut = vi.fn();

    overrideCall(track, (method: string) =>
      method === "create_midi_clip" ? "id 1" : USE_CALL_FALLBACK,
    );

    expect(() => shorten(false, { onCut })).toThrow(/Live created no clip/);
    expect(onCut).not.toHaveBeenCalled();
  });
});
