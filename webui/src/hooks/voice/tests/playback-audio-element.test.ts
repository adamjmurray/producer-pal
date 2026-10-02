// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import {
  createPlaybackAudioElement,
  setAudioVolume,
  teardownAudioElement,
} from "#webui/hooks/voice/helpers/playback-audio-element";

describe("createPlaybackAudioElement", () => {
  it("creates an autoplay element at the given volume", () => {
    const el = createPlaybackAudioElement(0.5);

    expect(el.autoplay).toBe(true);
    expect(el.volume).toBe(0.5);
  });

  it("defaults to unity when volume is undefined", () => {
    expect(createPlaybackAudioElement(undefined).volume).toBe(1);
  });

  it("clamps an out-of-range volume to [0, 1]", () => {
    expect(createPlaybackAudioElement(5).volume).toBe(1);
    expect(createPlaybackAudioElement(-1).volume).toBe(0);
  });
});

describe("setAudioVolume", () => {
  it("applies a clamped volume to the element", () => {
    const el = createPlaybackAudioElement(1);

    setAudioVolume(el, 0.25);
    expect(el.volume).toBe(0.25);

    setAudioVolume(el, 5);
    expect(el.volume).toBe(1);
  });

  it("is a no-op when there is no element", () => {
    expect(() => setAudioVolume(null, 0.5)).not.toThrow();
  });
});

describe("teardownAudioElement", () => {
  it("pauses and detaches the stream", () => {
    const el = createPlaybackAudioElement(1);
    const pause = vi.spyOn(el, "pause");

    el.srcObject = new MediaStream();
    teardownAudioElement(el);

    expect(pause).toHaveBeenCalled();
    expect(el.srcObject).toBeNull();
  });

  it("is a no-op when there is no element", () => {
    expect(() => teardownAudioElement(null)).not.toThrow();
  });
});
