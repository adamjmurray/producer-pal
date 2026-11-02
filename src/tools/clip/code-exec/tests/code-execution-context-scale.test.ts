// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { buildCodeExecutionContext } from "../code-execution-context.ts";

/**
 * Register a session clip holding the given scale properties.
 * @param scale - Its scale properties
 * @returns The clip
 */
function clipWith(scale: Record<string, unknown>): LiveAPI {
  registerMockObject("track-0", {
    path: livePath.track(0),
    type: "Track",
    properties: { name: "T", has_midi_input: 1 },
  });
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    type: "Clip",
    properties: {
      name: "C",
      length: 4,
      signature_numerator: 4,
      signature_denominator: 4,
      looping: 0,
      ...scale,
    },
  });

  return LiveAPI.from("id clip1");
}

describe("buildCodeExecutionContext - the clip's own scale", () => {
  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    registerSongScale(
      { scale_mode: 1, root_note: 0, scale_name: "Major" },
      { tempo: 120, signature_numerator: 4, signature_denominator: 4 },
    );
  });

  it("puts the clip's scale on the clip, apart from the Live Set's", () => {
    const clip = clipWith({
      scale_mode: 1,
      root_note: 2,
      scale_name: "Dorian",
    });

    const context = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(context.clip.scale).toBe("D Dorian");
    expect(context.liveSet.scale).toBe("C Major");
  });

  it("puts it between looping and the clip's place in the batch", () => {
    const clip = clipWith({ scale_mode: 1, root_note: 0, scale_name: "Minor" });

    const context = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(Object.keys(context.clip)).toStrictEqual([
      "id",
      "name",
      "length",
      "timeSignature",
      "looping",
      "scale",
      "index",
      "count",
    ]);
  });

  it("leaves it out when the clip's scale is off, though the Live Set's is on", () => {
    const clip = clipWith({
      scale_mode: 0,
      root_note: 2,
      scale_name: "Dorian",
    });

    const context = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(context.clip).not.toHaveProperty("scale");
    expect(context.liveSet.scale).toBe("C Major");
  });

  it("leaves it out where Live gives clips no scale", () => {
    registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    const clip = clipWith({
      scale_mode: 1,
      root_note: 2,
      scale_name: "Dorian",
    });

    const context = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(context.clip).not.toHaveProperty("scale");
    expect(context.liveSet.scale).toBe("C Major");
  });

  it("leaves it out for an audio clip, without asking Live for its version", () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    const clip = clipWith({
      is_audio_clip: 1,
      scale_mode: 1,
      root_note: 2,
      scale_name: "Dorian",
    });

    const context = buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(context.clip).not.toHaveProperty("scale");
    expect(asked()).toBe(0);
  });

  it("asks Live for its version once", () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    const clip = clipWith({ scale_mode: 1, root_note: 0, scale_name: "Minor" });

    buildCodeExecutionContext(clip, "session", 0, 1, 0);

    expect(asked()).toBe(1);
  });
});
