// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  audioClipSampleSeconds,
  audioClipTiming,
} from "../audio-clip-timing.ts";

const SAMPLE_RATE = 48000;

const CLIP_PATH = livePath.track(0).clipSlot(0).clip();

/**
 * Register a Live Set at the given tempo plus an audio clip, and return the
 * clip handle. Property values follow Live's own convention: a warped clip's
 * markers are in beats, an unwarped clip's are in seconds.
 * @param options - Clip and Set configuration
 * @param options.tempo - Live Set tempo (default 120)
 * @param options.warping - Whether the clip is warped
 * @param options.sampleSeconds - The sample's duration in seconds
 * @param options.start - start_marker, in the clip's own unit
 * @param options.end - end_marker, in the clip's own unit
 * @param options.looping - Whether the clip loops (default false)
 * @param options.loopStart - loop_start, in the clip's own unit
 * @param options.loopEnd - loop_end, in the clip's own unit
 * @returns A LiveAPI handle on the registered clip
 */
function setupAudioClip({
  tempo = 120,
  warping,
  sampleSeconds,
  start,
  end,
  looping = false,
  loopStart = 0,
  loopEnd = 0,
}: {
  tempo?: number;
  warping: boolean;
  sampleSeconds: number;
  start: number;
  end: number;
  looping?: boolean;
  loopStart?: number;
  loopEnd?: number;
}) {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { tempo },
  });

  registerMockObject("audio-clip", {
    path: CLIP_PATH,
    properties: {
      warping: warping ? 1 : 0,
      looping: looping ? 1 : 0,
      start_marker: start,
      end_marker: end,
      loop_start: loopStart,
      loop_end: loopEnd,
      sample_rate: SAMPLE_RATE,
      sample_length: sampleSeconds * SAMPLE_RATE,
    },
  });

  return LiveAPI.from(CLIP_PATH);
}

describe("audioClipTiming", () => {
  describe("warped clips", () => {
    it("reads markers as beats", () => {
      const clip = setupAudioClip({
        warping: true,
        sampleSeconds: 2.7,
        start: 0,
        end: 4,
      });

      expect(audioClipTiming(clip)).toStrictEqual({
        warping: true,
        sampleSeconds: 2.7,
        startBeats: 0,
        endBeats: 4,
        firstStartBeats: 0,
      });
    });

    it("does not clamp the region to the sample, which plays silence past it", () => {
      const clip = setupAudioClip({
        warping: true,
        sampleSeconds: 2,
        start: 0,
        end: 16,
      });

      expect(audioClipTiming(clip).endBeats).toBe(16);
    });

    it("uses the loop brace when looping", () => {
      const clip = setupAudioClip({
        warping: true,
        sampleSeconds: 8,
        start: 1,
        end: 16,
        looping: true,
        loopStart: 4,
        loopEnd: 12,
      });

      const timing = audioClipTiming(clip);

      expect(timing.startBeats).toBe(4);
      expect(timing.endBeats).toBe(12);
      // The start marker is where the first pass begins, ahead of the loop
      expect(timing.firstStartBeats).toBe(1);
    });
  });

  describe("unwarped clips", () => {
    // Live switches these properties from beats to seconds when warping is off.
    // Reading them as beats under-reports the region by a factor of tempo/60.
    it("converts second-valued markers to beats at the Set tempo", () => {
      const clip = setupAudioClip({
        warping: false,
        sampleSeconds: 1.2,
        start: 0,
        end: 1.2,
      });

      const timing = audioClipTiming(clip);

      expect(timing.warping).toBe(false);
      expect(timing.endBeats).toBeCloseTo(2.4, 10);
    });

    it("scales with tempo, unlike a warped clip", () => {
      const clip = setupAudioClip({
        tempo: 60,
        warping: false,
        sampleSeconds: 1.2,
        start: 0,
        end: 1.2,
      });

      expect(audioClipTiming(clip).endBeats).toBeCloseTo(1.2, 10);
    });

    it("clamps a stale end marker to the sample", () => {
      // Switching warp off leaves end_marker at the beat value the warped grid
      // had put there, reinterpreted as seconds — here 4s against a 1.5s file.
      // Live clamps playback at the file boundary, so the region is 1.5s.
      const clip = setupAudioClip({
        warping: false,
        sampleSeconds: 1.5,
        start: 0,
        end: 4,
      });

      // 1.5s at 120bpm = 3 beats, matching Live's own end_time - start_time
      expect(audioClipTiming(clip).endBeats).toBeCloseTo(3, 10);
    });

    it("leaves the region unclamped when the sample rate is unreadable", () => {
      registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { tempo: 120 },
      });

      registerMockObject("audio-clip", {
        path: CLIP_PATH,
        properties: {
          warping: 0,
          looping: 0,
          start_marker: 0,
          end_marker: 1.5,
          loop_start: 0,
          loop_end: 1.5,
          sample_rate: 0,
          sample_length: 0,
        },
      });

      const timing = audioClipTiming(LiveAPI.from(CLIP_PATH));

      expect(timing.sampleSeconds).toBe(0);
      expect(timing.endBeats).toBeCloseTo(3, 10);
    });
  });
});

describe("audioClipSampleSeconds", () => {
  it("divides the frame count by the sample rate", () => {
    registerMockObject("audio-clip", {
      path: CLIP_PATH,
      properties: { sample_length: 129600, sample_rate: 48000 },
    });

    expect(audioClipSampleSeconds(LiveAPI.from(CLIP_PATH))).toBeCloseTo(
      2.7,
      10,
    );
  });

  it("returns 0 rather than dividing by a missing sample rate", () => {
    registerMockObject("audio-clip", {
      path: CLIP_PATH,
      properties: { sample_length: 129600, sample_rate: 0 },
    });

    expect(audioClipSampleSeconds(LiveAPI.from(CLIP_PATH))).toBe(0);
  });
});
