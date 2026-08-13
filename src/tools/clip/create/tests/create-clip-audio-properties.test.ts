// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { LIVE_API_WARP_MODE_TEXTURE } from "#src/tools/constants.ts";
import { createClip } from "../create-clip.ts";
import {
  setupSessionAudioClipMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

describe("createClip - audio properties", () => {
  it("should set gainDb on a new audio clip", async () => {
    const { clip } = setupSessionAudioClipMocks();

    await createClip({
      slot: "0/0",
      sampleFile: "/path/to/kick.wav",
      gainDb: -6,
    });

    // Live stores gain on a non-dB scale, so assert the property was written
    // rather than the exact curve value (gain-utils owns that conversion).
    expect(clip.set).toHaveBeenCalledWith("gain", expect.any(Number));
  });

  it("should split pitchShift into coarse semitones and fine cents", async () => {
    const { clip } = setupSessionAudioClipMocks();

    await createClip({
      slot: "0/0",
      sampleFile: "/path/to/kick.wav",
      pitchShift: 5.25,
    });

    expect(clip.set).toHaveBeenCalledWith("pitch_coarse", 5);
    expect(clip.set).toHaveBeenCalledWith("pitch_fine", 25);
  });

  it("should set warpMode on a new audio clip", async () => {
    const { clip } = setupSessionAudioClipMocks();

    await createClip({
      slot: "0/0",
      sampleFile: "/path/to/kick.wav",
      warpMode: "texture",
    });

    expect(clip.set).toHaveBeenCalledWith(
      "warp_mode",
      LIVE_API_WARP_MODE_TEXTURE,
    );
  });

  it("should leave audio properties alone when not provided", async () => {
    const { clip } = setupSessionAudioClipMocks();

    await createClip({ slot: "0/0", sampleFile: "/path/to/kick.wav" });

    expect(clip.set).not.toHaveBeenCalledWith("gain", expect.anything());
    expect(clip.set).not.toHaveBeenCalledWith(
      "pitch_coarse",
      expect.anything(),
    );
    expect(clip.set).not.toHaveBeenCalledWith("warp_mode", expect.anything());
  });

  it("should warn and skip audio properties on a MIDI clip", async () => {
    const warnSpy = vi.spyOn(v8Console, "warn").mockImplementation(() => {});

    setupSessionMocks();

    await createClip({ slot: "0/0", gainDb: -6, warpMode: "texture" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("gainDb, warpMode ignored for MIDI clips"),
    );
  });
});
