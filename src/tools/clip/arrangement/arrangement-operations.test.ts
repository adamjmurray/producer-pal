// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { handleArrangementLengthOperation } from "./arrangement-operations.ts";
import * as helpers from "./helpers/arrangement-length-changes.ts";

interface MockClipOptions {
  id?: string;
  path?: string;
  props?: Record<string, number>;
}

function createMockClip({
  id = "789",
  path = "live_set tracks 0 arrangement_clips 0",
  props = {},
}: MockClipOptions = {}): LiveAPI {
  const merged: Record<string, number> = {
    is_arrangement_clip: 1,
    start_time: 0,
    end_time: 8,
    ...props,
  };

  return {
    id,
    path,
    getProperty: vi.fn((prop: string) => merged[prop]),
  } as unknown as LiveAPI;
}

/**
 * Run handleArrangementLengthOperation on a clip it must refuse, and assert it
 * returned no clips and left `reason` on the clip's own entry.
 * @param clip - The clip stub under test
 * @param reason - Substring the clip's reason must contain
 */
function expectSkippedWithReason(clip: LiveAPI, reason: string): void {
  const reasons: ClipReasons = newClipReasons();
  const result = handleArrangementLengthOperation({
    clip,
    isAudioClip: false,
    arrangementLengthBeats: 16,
    context: {},
    reasons,
  });

  expect(result).toStrictEqual([]);
  expect(reasons.said.get(clip.id)?.join("; ")).toContain(reason);
}

describe("handleArrangementLengthOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a session clip on its own entry", () => {
    const clip = createMockClip({ props: { is_arrangement_clip: 0 } });

    expectSkippedWithReason(clip, "ignored: this is a session clip");
  });

  it("reports a take-lane clip on its own entry", () => {
    const clip = createMockClip({
      path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
    });

    expectSkippedWithReason(clip, "ignored for a take-lane clip");
  });

  it("delegates to handleArrangementLengthening when target length is longer", () => {
    const lengtheningSpy = vi
      .spyOn(helpers, "handleArrangementLengthening")
      .mockReturnValue([{ id: "789" }]);
    const clip = createMockClip({ props: { start_time: 0, end_time: 8 } });

    const result = handleArrangementLengthOperation({
      clip,
      isAudioClip: true,
      arrangementLengthBeats: 16,
      context: {},
      reasons: newClipReasons(),
    });

    expect(lengtheningSpy).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([{ id: "789" }]);
  });

  it("delegates to handleArrangementShortening when target length is shorter", () => {
    const shorteningSpy = vi
      .spyOn(helpers, "handleArrangementShortening")
      .mockImplementation(() => {});
    const clip = createMockClip({ props: { start_time: 0, end_time: 8 } });

    const result = handleArrangementLengthOperation({
      clip,
      isAudioClip: false,
      arrangementLengthBeats: 4,
      context: {},
      reasons: newClipReasons(),
    });

    expect(shorteningSpy).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([]);
  });

  // Growing a clip runs over whatever sits after it, and Live says nothing
  // about the clip it destroys.
  it("says on the clip's entry what the lengthening overwrote", () => {
    clearMockRegistry();
    mockNonExistentObjects();
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });

    const trackProps: Record<string, unknown> = {
      arrangement_clips: children("789", "neighbour"),
    };

    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: trackProps,
    });
    registerMockObject("789", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: { is_arrangement_clip: 1, start_time: 0, end_time: 8 },
    });
    registerMockObject("neighbour", {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
      properties: { start_time: 8, end_time: 16 },
    });
    vi.spyOn(helpers, "handleArrangementLengthening").mockImplementation(() => {
      trackProps.arrangement_clips = children("789");

      return [{ id: "789" }];
    });

    const reasons = newClipReasons();

    handleArrangementLengthOperation({
      clip: LiveAPI.from("789"),
      isAudioClip: false,
      arrangementLengthBeats: 16,
      context: {},
      reasons,
    });

    expect(reasons.said.get("789")).toStrictEqual([
      "overwrote the clip at t0[3|1]",
    ]);
  });

  it("does nothing when target length equals current length", () => {
    const lengtheningSpy = vi.spyOn(helpers, "handleArrangementLengthening");
    const shorteningSpy = vi.spyOn(helpers, "handleArrangementShortening");
    const clip = createMockClip({ props: { start_time: 0, end_time: 8 } });

    const result = handleArrangementLengthOperation({
      clip,
      isAudioClip: false,
      arrangementLengthBeats: 8,
      context: {},
      reasons: newClipReasons(),
    });

    expect(lengtheningSpy).not.toHaveBeenCalled();
    expect(shorteningSpy).not.toHaveBeenCalled();
    expect(result).toStrictEqual([]);
  });
});
