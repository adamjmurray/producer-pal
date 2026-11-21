// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { newCallScale } from "../call-scale.ts";
import {
  C_MAJOR_INTERVALS,
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  registerSongScale,
} from "./scale-test-helpers.ts";

const D_DORIAN_INTERVALS = [0, 2, 3, 5, 7, 9, 10];
const CHROMATIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Register a clip.
 * @param props - Its properties
 * @returns The clip
 */
function clipWith(props: Record<string, unknown>): LiveAPI {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    type: "Clip",
    properties: { is_audio_clip: 0, ...props },
  });

  return LiveAPI.from("id clip1");
}

describe("newCallScale", () => {
  describe("supported", () => {
    it.each([
      [LIVE_WITHOUT_CLIP_SCALE, false],
      ["12.4", false],
      ["12.4.15b1", false],
      [LIVE_WITH_CLIP_SCALE, true],
      ["12.4.16b1", true],
      ["12.4.16", true],
      ["12.5", true],
    ])("only a release counts: Live %s is %s", (version, expected) => {
      registerLiveVersion(version);

      expect(newCallScale().supported()).toBe(expected);
    });

    it("asks Live for its version once", () => {
      const asked = registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      const scale = newCallScale();

      scale.supported();
      scale.supported();
      scale.supported();

      expect(asked()).toBe(1);
    });

    it("keeps a false answer too", () => {
      const asked = registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
      const scale = newCallScale();

      scale.supported();
      scale.supported();

      expect(asked()).toBe(1);
    });
  });

  describe("song", () => {
    it("reads the Live Set's scale and its mask", () => {
      registerSongScale({
        scale_mode: 1,
        root_note: 2,
        scale_name: "Dorian",
        scale_intervals: D_DORIAN_INTERVALS,
      });

      expect(newCallScale().song()).toStrictEqual({
        enabled: true,
        rootNote: 2,
        name: "Dorian",
        // D Dorian has the pitch classes of C Major.
        mask: 2741,
      });
    });

    it("has no mask while the scale is off, whatever it was", () => {
      registerSongScale({ scale_mode: 0, scale_intervals: C_MAJOR_INTERVALS });

      expect(newCallScale().song()).toStrictEqual(
        expect.objectContaining({ enabled: false, mask: undefined }),
      );
    });

    it("has no mask for a chromatic scale", () => {
      registerSongScale({ scale_mode: 1, scale_intervals: CHROMATIC });

      expect(newCallScale().song().mask).toBeUndefined();
    });

    it("reads the Live Set once", () => {
      registerSongScale({ scale_mode: 1 });
      const scale = newCallScale();

      const first = scale.song();

      registerSongScale({ scale_mode: 0 });

      expect(scale.song()).toBe(first);
    });
  });

  describe("clipMask", () => {
    it("is the clip's own scale where clips have one", () => {
      registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({
        scale_mode: 1,
        root_note: 2,
        scale_intervals: D_DORIAN_INTERVALS,
      });

      // D Dorian has the pitch classes of C Major.
      expect(newCallScale().clipMask(clip)).toBe(2741);
    });

    it("is the clip's scale even when it differs from the Live Set's", () => {
      registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({
        scale_mode: 1,
        root_note: 0,
        scale_intervals: [0, 3, 5, 7, 10],
      });

      expect(newCallScale().clipMask(clip)).toBe(0b0100_1010_1001);
    });

    it("is undefined for a clip whose scale is off, whatever the Live Set has", () => {
      registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({
        scale_mode: 0,
        root_note: 0,
        scale_intervals: C_MAJOR_INTERVALS,
      });

      expect(newCallScale().clipMask(clip)).toBeUndefined();
    });

    it("is undefined for a chromatic clip scale", () => {
      registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({
        scale_mode: 1,
        root_note: 0,
        scale_intervals: CHROMATIC,
      });

      expect(newCallScale().clipMask(clip)).toBeUndefined();
    });

    it("is the Live Set's where clips have no scale", () => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({ scale_mode: 0 });

      expect(newCallScale().clipMask(clip)).toBe(2741);
    });

    it("is the Live Set's for an audio clip", () => {
      registerLiveVersion(LIVE_WITH_CLIP_SCALE);
      registerSongScale({ scale_mode: 1, scale_intervals: C_MAJOR_INTERVALS });
      const clip = clipWith({ is_audio_clip: 1, scale_mode: 0 });

      expect(newCallScale().clipMask(clip)).toBe(2741);
    });

    it("reads the Live Set once for any number of clips", () => {
      registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
      registerSongScale({ scale_mode: 1 });
      const clip = clipWith({});
      const scale = newCallScale();

      scale.clipMask(clip);
      registerSongScale({ scale_mode: 0 });

      expect(scale.clipMask(clip)).toBe(2741);
    });
  });
});
