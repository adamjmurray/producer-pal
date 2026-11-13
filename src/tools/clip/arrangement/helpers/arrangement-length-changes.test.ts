// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { type LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import {
  fakeArrangementClip,
  type FakeClipState,
} from "#src/tools/shared/arrangement/tests/helpers/fake-arrangement-clip.ts";
import {
  newClipReasons,
  type ClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import * as clearAhead from "./clear-ahead-of-clip.ts";
import {
  handleArrangementLengthening,
  handleArrangementShortening,
} from "./arrangement-length-changes.ts";

interface Lengthened {
  result: { id: string }[];
  state: FakeClipState;
  reasons: ClipReasons;
  clear: ReturnType<typeof vi.spyOn>;
}

/**
 * Lengthen a fake MIDI clip at beat 8 to `target` beats, with clearing stubbed.
 * @param target - Target span in beats
 * @param overrides - Starting state for the clip
 * @returns The result, the clip's state, its reasons and the clear spy
 */
function lengthen(
  target: number,
  overrides: Partial<FakeClipState> = {},
): Lengthened {
  const { clip, state } = fakeArrangementClip({ startTime: 8, ...overrides });
  const reasons = newClipReasons();
  const clear = vi
    .spyOn(clearAhead, "clearAheadOfClip")
    .mockImplementation(() => undefined);
  const result = handleArrangementLengthening({
    clip,
    isAudioClip: false,
    arrangementLengthBeats: target,
    currentArrangementLength: state.span,
    currentStartTime: state.startTime,
    currentEndTime: state.startTime + state.span,
    context: {},
    reasons,
  });

  return { result, state, reasons, clear };
}

describe("handleArrangementLengthening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when the clip has no track", () => {
    expect(() => lengthen(16, { trackIndex: null })).toThrow(
      "no track for clip",
    );
  });

  it("clears the span, then grows a looped clip in place", () => {
    const { result, state, reasons, clear } = lengthen(16);

    expect(clear).toHaveBeenCalledWith(
      expect.objectContaining({ from: 12, to: 24 }),
    );
    expect(result).toStrictEqual([{ id: "1" }]);
    expect(state).toStrictEqual(
      expect.objectContaining({ span: 16, looping: true, loopEnd: 4 }),
    );
    expect(joinedClipReason(reasons, "1")).toBe("");
  });

  it("says where a looped clip landed when Live stopped it short", () => {
    const { reasons } = lengthen(16, { nextClipStart: 20 });

    expect(joinedClipReason(reasons, "1")).toBe(
      "arrangementLength landed at 3bar: Live stopped the clip there",
    );
    expect(reasons.landed.has("1")).toBe(true);
  });

  it("says a looped clip is unchanged when Live let it grow no further", () => {
    const { result, reasons } = lengthen(16, { nextClipStart: 12 });

    expect(result).toStrictEqual([]);
    expect(joinedClipReason(reasons, "1")).toBe(
      "arrangementLength unchanged: Live stopped the clip there",
    );
    expect(reasons.refused.has("1")).toBe(true);
    expect(reasons.landed.has("1")).toBe(false);
  });

  it("clears and grows an unlooped clip through loop_end", () => {
    const { state, clear } = lengthen(16, { looping: false });

    expect(clear).toHaveBeenCalledWith(
      expect.objectContaining({ from: 12, to: 24 }),
    );
    expect(state.span).toBe(16);
  });

  it("says the clip lengthened when a throw follows its growth", () => {
    const { clip, set } = fakeArrangementClip();
    const live = set.getMockImplementation() as (p: string, v: number) => void;
    const reasons = newClipReasons();
    const journal = vi.fn();

    reasons.journal = journal;
    vi.spyOn(clearAhead, "clearAheadOfClip").mockImplementation(
      () => undefined,
    );
    set.mockImplementation((property: string, value: number) => {
      if (property === "end_marker") {
        throw new Error("refused");
      }

      live(property, value);
    });

    expect(() =>
      handleArrangementLengthening({
        clip,
        isAudioClip: false,
        arrangementLengthBeats: 8,
        currentArrangementLength: 4,
        currentStartTime: 0,
        currentEndTime: 4,
        context: {},
        reasons,
      }),
    ).toThrow("refused");
    expect(journal).toHaveBeenCalledWith("lengthened", { id: "1" });
  });

  it("says a scratch clip that stayed on the clip's entry", () => {
    const { clip } = fakeArrangementClip();
    const reasons = newClipReasons();

    vi.spyOn(clearAhead, "clearAheadOfClip").mockImplementation(
      ({ reportScratch }) => reportScratch("couldn't remove it"),
    );
    handleArrangementLengthening({
      clip,
      isAudioClip: false,
      arrangementLengthBeats: 8,
      currentArrangementLength: 4,
      currentStartTime: 0,
      currentEndTime: 4,
      context: {},
      reasons,
    });

    expect(joinedClipReason(reasons, "1")).toBe("couldn't remove it");
  });
});

describe("handleArrangementShortening", () => {
  it.each([
    ["a looped clip", true],
    ["an unlooped clip", false],
  ])("cuts %s in place and says so", (_, looping) => {
    const { clip, state } = fakeArrangementClip({
      looping,
      span: 16,
      unloopedEnd: 16,
      endMarker: 16,
    });
    const onCut = vi.fn();
    const lanes = { clipChanged: vi.fn() } as unknown as LaneView;

    handleArrangementShortening({
      clip,
      isAudioClip: false,
      arrangementLengthBeats: 2,
      context: { lanes },
      onCut,
    });

    expect(state).toStrictEqual(expect.objectContaining({ span: 2, looping }));
    expect(onCut).toHaveBeenCalledTimes(1);
    expect(lanes.clipChanged).toHaveBeenCalledWith(clip);
  });

  it.each([
    ["says it was cut when the span had changed", "end_marker", 1],
    ["says nothing when the span never changed", "loop_end", 0],
  ])("%s before a throw", (_, refused, cuts) => {
    const { clip, set } = fakeArrangementClip({
      looping: false,
      span: 16,
      unloopedEnd: 16,
      endMarker: 16,
    });
    const live = set.getMockImplementation() as (p: string, v: number) => void;
    const onCut = vi.fn();

    set.mockImplementation((property: string, value: number) => {
      if (property === refused) {
        throw new Error("refused");
      }

      live(property, value);
    });

    expect(() =>
      handleArrangementShortening({
        clip,
        isAudioClip: false,
        arrangementLengthBeats: 2,
        context: {},
        onCut,
      }),
    ).toThrow("refused");
    expect(onCut).toHaveBeenCalledTimes(cuts);
  });
});
