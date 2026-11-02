// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  C_MAJOR_INTERVALS,
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
  type ScaleProps,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { readClip, type ReadClipResult } from "../read-clip.ts";

const D_DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];

const SONG_C_MAJOR: Partial<ScaleProps> = {
  scale_mode: 1,
  root_note: 0,
  scale_name: "Major",
  scale_intervals: C_MAJOR_INTERVALS,
};

/**
 * Register a clip in slot t0/s<index>.
 * @param index - The scene index, and the clip's id suffix
 * @param props - Its properties
 */
function registerClip(index: number, props: Record<string, unknown>): void {
  registerMockObject(`clip${index}`, {
    path: livePath.track(0).clipSlot(index).clip(),
    type: "Clip",
    properties: { is_midi_clip: 1, name: `Clip ${index}`, ...props },
  });
}

/**
 * Read a clip.
 * @param id - The clip's id
 * @returns The clip's entry
 */
async function read(id: string): Promise<ReadClipResult> {
  return (await readClip({ id })) as ReadClipResult;
}

describe("readClip - a MIDI clip's own scale", () => {
  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    mockNonExistentObjects();
  });

  it("says nothing when the clip's scale is the Live Set's", async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      scale_mode: 1,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
    });

    const clip = await read("clip0");

    expect(clip).not.toHaveProperty("scale");
    expect(clip).not.toHaveProperty("scalePitches");
  });

  it("says nothing when neither has a scale, whatever they last held", async () => {
    registerSongScale({ scale_mode: 0, root_note: 0, scale_name: "Major" });
    registerClip(0, { scale_mode: 0, root_note: 5, scale_name: "Dorian" });

    expect(await read("clip0")).not.toHaveProperty("scale");
  });

  it("shows the clip's scale and its notes when the root differs", async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      scale_mode: 1,
      root_note: 2,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
    });

    expect(await read("clip0")).toStrictEqual(
      expect.objectContaining({
        scale: "D Major",
        scalePitches: "D,E,Gb,G,A,B,Db",
      }),
    );
  });

  it("shows the clip's scale when the name differs", async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      scale_mode: 1,
      root_note: 0,
      scale_name: "Dorian",
      scale_intervals: D_DORIAN_INTERVALS,
    });

    expect(await read("clip0")).toStrictEqual(
      expect.objectContaining({
        scale: "C Dorian",
        scalePitches: "C,D,Eb,F,G,A,Bb",
      }),
    );
  });

  it("shows the clip's scale when the Live Set has none", async () => {
    registerSongScale({ scale_mode: 0 });
    registerClip(0, {
      scale_mode: 1,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
    });

    expect(await read("clip0")).toStrictEqual(
      expect.objectContaining({
        scale: "C Major",
        scalePitches: "C,D,E,F,G,A,B",
      }),
    );
  });

  it('shows scale: "" when the clip has none and the Live Set has one', async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, { scale_mode: 0, root_note: 0, scale_name: "Major" });

    const clip = await read("clip0");

    expect(clip.scale).toBe("");
    expect(clip).not.toHaveProperty("scalePitches");
  });

  it("puts the scale before the notes", async () => {
    registerSongScale({ scale_mode: 0 });
    registerClip(0, {
      scale_mode: 1,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
      length: 4,
    });

    const keys = Object.keys(await read("clip0"));

    expect(keys.indexOf("scale")).toBeGreaterThan(keys.indexOf("type"));
  });

  it("compares each clip of a list with the Live Set, reading it once", async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      scale_mode: 1,
      root_note: 0,
      scale_name: "Major",
      scale_intervals: C_MAJOR_INTERVALS,
    });
    registerClip(1, { scale_mode: 0 });
    registerClip(2, {
      scale_mode: 1,
      root_note: 7,
      scale_name: "Minor",
      scale_intervals: [0, 2, 3, 5, 7, 8, 10],
    });

    const result = (await readClip({
      id: "clip0,clip1,clip2",
    })) as ReadClipResult[];

    expect(result.map((clip) => clip.scale)).toStrictEqual([
      undefined,
      "",
      "G Minor",
    ]);
  });

  it("leaves an audio clip's scale out", async () => {
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      is_midi_clip: 0,
      is_audio_clip: 1,
      scale_mode: 0,
    });

    expect(await read("clip0")).not.toHaveProperty("scale");
  });

  it("asks Live for its version and the Live Set's scale once for the call", async () => {
    const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);

    registerSongScale(SONG_C_MAJOR);
    registerClip(0, { scale_mode: 0 });
    registerClip(1, { scale_mode: 0 });
    registerClip(2, { scale_mode: 0 });

    await readClip({ id: "clip0,clip1,clip2" });

    expect(asked()).toBe(1);
  });
});

describe("readClip - Live without a scale on clips", () => {
  beforeEach(() => {
    mockNonExistentObjects();
  });

  it("leaves scale out, even for a clip that holds one", async () => {
    registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    registerSongScale(SONG_C_MAJOR);
    registerClip(0, {
      scale_mode: 1,
      root_note: 2,
      scale_name: "Dorian",
      scale_intervals: D_DORIAN_INTERVALS,
    });

    expect(await read("clip0")).not.toHaveProperty("scale");
  });

  it("does not read the Live Set's scale", async () => {
    registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    registerClip(0, { scale_mode: 0 });

    expect(await read("clip0")).not.toHaveProperty("scale");
    expect(resolves("live_set")).toBe(0);
  });
});
