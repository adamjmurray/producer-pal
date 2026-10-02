// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { describe, expect, it, vi } from "vitest";
import {
  buildCodeExecutionContext,
  getClipLocationInfo,
} from "../code-execution-context.ts";

/**
 * Register the Live Set object used by buildCodeExecutionContext / -Location.
 * @param props - Property overrides (tempo, time signature, scale_mode, ...)
 */
function registerLiveSet(props: Record<string, unknown> = {}): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      tempo: 120,
      signature_numerator: 4,
      signature_denominator: 4,
      scale_mode: 0,
      ...props,
    },
  });
}

/**
 * Register a track object at the given index.
 * @param index - Track index
 * @param props - Property overrides (name, has_midi_input, ...)
 */
function registerTrack(
  index: number,
  props: Record<string, unknown> = {},
): void {
  registerMockObject(livePath.track(index), {
    path: livePath.track(index),
    type: "Track",
    properties: { name: `Track ${index}`, has_midi_input: 1, ...props },
  });
}

/**
 * Build a minimal clip mock (plain object) for the context builders.
 * @param path - The clip path (parsed for track/scene index)
 * @param opts - Optional trackIndex and getProperty overrides
 * @param opts.trackIndex - Value for clip.trackIndex
 * @param opts.props - Property overrides returned by getProperty
 * @returns A LiveAPI-shaped clip mock
 */
function makeClip(
  path: string,
  opts: { trackIndex?: number; props?: Record<string, unknown> } = {},
): LiveAPI {
  const props: Record<string, unknown> = {
    name: "Clip",
    signature_numerator: 4,
    signature_denominator: 4,
    length: 4,
    looping: 1,
    ...opts.props,
  };

  return {
    id: "clip-1",
    path,
    trackIndex: opts.trackIndex,
    getProperty: vi.fn((prop: string) => props[prop]),
  } as unknown as LiveAPI;
}

describe("buildCodeExecutionContext", () => {
  it("scales clip length by denominator/4 (musical beats)", () => {
    // 6/8, raw length 8 → 8 * (8/4) = 16 musical beats. A `/` mutant → 4.
    registerLiveSet();
    registerTrack(0);
    const clip = makeClip(livePath.track(0).clipSlot(0).clip(), {
      trackIndex: 0,
      props: { signature_numerator: 6, signature_denominator: 8, length: 8 },
    });

    const result = buildCodeExecutionContext(clip, "session", 0, 1, 0);
    const clipLengthBeats = result.clip.length;

    expect(clipLengthBeats).toBe(16);
  });

  it("parses a two-digit track index from the clip path", () => {
    // `/tracks (\d)/` (no +) would capture "1" from "tracks 10" and read Track 1.
    registerLiveSet();
    registerTrack(10, { name: "Track Ten" });
    const clip = makeClip(livePath.track(10).clipSlot(0).clip(), {
      trackIndex: 10,
    });

    const result = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(result.track.index).toBe(10);
    expect(result.track.name).toBe("Track Ten");
  });

  it("falls back to track 0 when the path has no track segment", () => {
    // Removing the optional chaining (`trackMatch[1]`) would throw on the null
    // match; the original returns index 0.
    registerLiveSet();
    registerTrack(0, { name: "Track Zero", has_midi_input: 0 });
    const clip = makeClip("live_set");

    const result = buildCodeExecutionContext(clip, "session", 0, 1);

    expect(result.track.index).toBe(0);
    expect(result.track.name).toBe("Track Zero");
    expect(result.track.type).toBe("audio");
  });

  it("omits the slot for a session clip without a scene index", () => {
    // Kills the `&&`→`||` and forced-true mutants on the clip-slot guard:
    // view is "session" but sceneIndex is undefined, so no slot is set.
    registerLiveSet();
    registerTrack(2);
    const clip = makeClip(livePath.track(2).clipSlot(3).clip(), {
      trackIndex: 2,
    });

    const result = buildCodeExecutionContext(clip, "session", 0, 1, undefined);

    expect(result.location).toStrictEqual({ view: "session" });
  });

  it("names an arrangement clip by the lane it is on and where it starts", () => {
    registerLiveSet();
    registerTrack(0);
    const clip = makeClip(livePath.track(0).arrangementClip(0), {
      trackIndex: 0,
      props: { start_time: 16 },
    });

    const result = buildCodeExecutionContext(clip, "arrangement", 0, 1);

    // 16 Ableton beats in 4/4 is bar 5 beat 1
    expect(result.location).toStrictEqual({
      view: "arrangement",
      path: "t0[5|1]",
      arrangementStartBeats: 16,
    });
  });
});

describe("getClipLocationInfo", () => {
  it("parses a two-digit scene index from a session clip path", () => {
    // `/clip_slots (\d)/` (no +) would capture "1" from "clip_slots 12".
    const clip = {
      path: livePath.track(0).clipSlot(12).clip(),
      getProperty: vi.fn((prop: string) =>
        prop === "is_arrangement_clip" ? 0 : undefined,
      ),
    } as unknown as LiveAPI;

    expect(getClipLocationInfo(clip)).toStrictEqual({
      view: "session",
      sceneIndex: 12,
    });
  });

  it("returns an undefined scene index when the path has no clip slot", () => {
    // Removing the optional chaining (`slotMatch[1]`) would throw on the null
    // match; the original returns sceneIndex undefined.
    const clip = {
      path: "live_set tracks 0",
      getProperty: vi.fn((prop: string) =>
        prop === "is_arrangement_clip" ? 0 : undefined,
      ),
    } as unknown as LiveAPI;

    expect(getClipLocationInfo(clip)).toStrictEqual({
      view: "session",
      sceneIndex: undefined,
    });
  });
});
