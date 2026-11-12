// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import "../../live-api-extensions.ts";

function clipWith(
  properties: Record<string, unknown>,
  path = livePath.returnTrack(1).clipSlot(2).clip(),
): RegisteredMockObject {
  return registerMockObject("clip-1", { path, type: "Clip", properties });
}

describe("LiveAPI extensions - nonMidiClipIsEnvelope", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerLiveVersion("13.0");
  });

  it("is true for a clip whose audio flag is 0", () => {
    const mock = clipWith({ is_midi_clip: 0, is_audio_clip: 0 });

    expect(LiveAPI.from("id clip-1").nonMidiClipIsEnvelope).toBe(true);
    expect(mock.get).not.toHaveBeenCalledWith("is_midi_clip");
  });

  it("is false for an audio clip", () => {
    clipWith({ is_audio_clip: 1 });

    expect(LiveAPI.from("id clip-1").nonMidiClipIsEnvelope).toBe(false);
  });

  it("is false on Live 12, which has none, without reading is_audio_clip", () => {
    registerLiveVersion("12.4.15");
    const mock = clipWith({ is_audio_clip: 0 });

    expect(LiveAPI.from("id clip-1").nonMidiClipIsEnvelope).toBe(false);
    expect(mock.get).not.toHaveBeenCalledWith("is_audio_clip");
  });
});

describe("LiveAPI extensions - a return track's clip slot indices", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("reports the scene in returnClipSlotIndex, and leaves the regular ones null", () => {
    clipWith({ is_midi_clip: 0 });
    const clip = LiveAPI.from("id clip-1");

    expect(clip.returnClipSlotIndex).toBe(2);
    expect(clip.returnTrackIndex).toBe(1);
    // Many callers read a null sceneIndex as "arrangement clip".
    expect(clip.sceneIndex).toBeNull();
    expect(clip.clipSlotIndex).toBeNull();
    expect(clip.trackIndex).toBeNull();
  });

  it("is null for a regular track's slot", () => {
    clipWith({ is_midi_clip: 1 }, livePath.track(1).clipSlot(2).clip());

    expect(LiveAPI.from("id clip-1").returnClipSlotIndex).toBeNull();
  });
});
