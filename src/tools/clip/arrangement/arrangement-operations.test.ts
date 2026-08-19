// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { handleArrangementLengthOperation } from "./arrangement-operations.ts";
import * as helpers from "./helpers/arrangement-operations-helpers.ts";

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
 * returned no clips and warned with `reason`.
 * @param clip - The clip stub under test
 * @param warnSpy - The console.warn spy for this case
 * @param reason - Substring the warning must contain
 */
function expectSkippedWithWarning(
  clip: LiveAPI,
  warnSpy: ReturnType<typeof vi.spyOn>,
  reason: string,
): void {
  const result = handleArrangementLengthOperation({
    clip,
    isAudioClip: false,
    arrangementLengthBeats: 16,
    context: {},
  });

  expect(result).toStrictEqual([]);
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(reason));
}

describe("handleArrangementLengthOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns and skips for a session clip", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clip = createMockClip({ props: { is_arrangement_clip: 0 } });

    expectSkippedWithWarning(clip, warnSpy, "ignored for session clip");
  });

  it("warns and skips for a take-lane clip", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clip = createMockClip({
      path: "live_set tracks 0 take_lanes 1 arrangement_clips 0",
    });

    expectSkippedWithWarning(clip, warnSpy, "ignored for take-lane clip");
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
    });

    expect(shorteningSpy).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual([]);
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
    });

    expect(lengtheningSpy).not.toHaveBeenCalled();
    expect(shorteningSpy).not.toHaveBeenCalled();
    expect(result).toStrictEqual([]);
  });
});
