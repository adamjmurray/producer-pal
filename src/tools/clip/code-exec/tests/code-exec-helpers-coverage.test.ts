// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as v8Console from "#src/shared/v8-max-console.ts";
import { describe, expect, it, vi } from "vitest";
import { type CodeNote } from "../code-exec-types.ts";
import {
  applyNotesToClip,
  buildCodeExecutionContext,
  getClipLocationInfo,
} from "../code-exec-helpers.ts";

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

describe("applyNotesToClip collision warning", () => {
  function note(start: number, duration: number, velocity: number): CodeNote {
    return {
      pitch: 60,
      start,
      duration,
      velocity,
      velocityDeviation: 0,
      probability: 1,
    };
  }

  it("emits no warning when there are no collisions", () => {
    // Two distinct onsets → collisions === 0 → the `collisions > 0` guard must
    // stay closed (kills the >=0 and forced-true mutants).
    const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
    const mockClip = {
      getProperty: vi.fn().mockReturnValue(4),
      call: vi.fn(),
    };

    applyNotesToClip(mockClip as unknown as LiveAPI, [
      note(0, 1, 100),
      note(1, 1, 100),
    ]);

    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the singular noun for exactly one collision", () => {
    // Two same-pitch+start notes → 1 collision → "1 duplicate note" (no "s").
    // Full-string assertion kills the plural-forcing and "s"-blanking mutants.
    const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
    const mockClip = {
      getProperty: vi.fn().mockReturnValue(4),
      call: vi.fn(),
    };

    applyNotesToClip(mockClip as unknown as LiveAPI, [
      note(0, 1, 100),
      note(0, 2, 80),
    ]);

    expect(warn).toHaveBeenCalledWith(
      "Dropped 1 duplicate note at the same pitch and start",
    );
  });

  it("uses the plural noun for more than one collision", () => {
    // Three same-pitch+start notes → 2 collisions → "2 duplicate notes".
    // Kills the singular-forcing, blanked-"s", and "Stryker was here!" mutants.
    const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
    const mockClip = {
      getProperty: vi.fn().mockReturnValue(4),
      call: vi.fn(),
    };

    applyNotesToClip(mockClip as unknown as LiveAPI, [
      note(0, 1, 100),
      note(0, 2, 90),
      note(0, 3, 80),
    ]);

    expect(warn).toHaveBeenCalledWith(
      "Dropped 2 duplicate notes at the same pitch and start",
    );
  });
});

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
    // Kills the `&&`→`||` and forced-true mutants on the session-slot guard:
    // view is "session" but sceneIndex is undefined, so no slot is set.
    registerLiveSet();
    registerTrack(2);
    const clip = makeClip(livePath.track(2).clipSlot(3).clip(), {
      trackIndex: 2,
    });

    const result = buildCodeExecutionContext(clip, "session", 0, 1, undefined);

    expect(result.location).toStrictEqual({ view: "session" });
  });

  it("omits arrangementStart for an arrangement clip without a start", () => {
    // Kills the `&&`→`||` and forced-true mutants on the arrangement guard:
    // view is "arrangement" but arrangementStartBeats is undefined.
    registerLiveSet();
    registerTrack(0);
    const clip = makeClip(livePath.track(0).arrangementClip(0), {
      trackIndex: 0,
    });

    const result = buildCodeExecutionContext(
      clip,
      "arrangement",
      0,
      1,
      undefined,
      undefined,
    );

    expect(result.location).toStrictEqual({ view: "arrangement" });
  });

  it("scales arrangementStart by the song denominator/4", () => {
    // Song is 4/8, start 16 Ableton beats → 16 * (8/4) = 32 musical beats.
    // A `/` mutant → 8.
    registerLiveSet({ signature_denominator: 8 });
    registerTrack(0);
    const clip = makeClip(livePath.track(0).arrangementClip(0), {
      trackIndex: 0,
    });

    const result = buildCodeExecutionContext(
      clip,
      "arrangement",
      0,
      1,
      undefined,
      16,
    );

    expect(result.location.arrangementStart).toBe(32);
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
