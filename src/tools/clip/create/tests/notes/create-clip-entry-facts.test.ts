// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { createClip } from "../../create-clip.ts";
import {
  setupArrangementClipMocks,
  setupAudioArrangementClipMocks,
  setupSessionAudioClipMocks,
  setupSessionMocks,
} from "../create-clip-test-helpers.ts";

const FOUR_FOUR = { signature_numerator: 4, signature_denominator: 4 };
const DUPLICATE_PAIR =
  '[{"pitch":60,"start":0,"duration":1,"velocity":100},{"pitch":60,"start":0,"duration":1,"velocity":100}]';

/**
 * @param result - A create-clip result with one clip
 * @returns The clip entry's detail
 */
function detailOf(result: unknown): string | undefined {
  return (result as { detail?: string }).detail;
}

describe("createClip - facts about a clip go on its entry", () => {
  describe("transforms that can't apply", () => {
    it("says so on a session MIDI clip with no notes", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      const result = await createClip({
        slot: "0/0",
        transforms: "velocity = 100",
      });

      expect(detailOf(result)).toBe(
        "transforms ignored: the clip has no notes",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says so on an arrangement MIDI clip with no notes", async () => {
      setupArrangementClipMocks();

      const result = await createClip({
        path: "t0[3|1]",
        transforms: "velocity = 100",
      });

      expect(detailOf(result)).toBe(
        "transforms ignored: the clip has no notes",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says so on a session audio clip", async () => {
      setupSessionAudioClipMocks();

      const result = await createClip({
        slot: "0/0",
        sampleFile: "/path/to/audio.wav",
        transforms: "velocity = 100",
      });

      expect(detailOf(result)).toBe("transforms ignored: the clip is audio");
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says so on an arrangement audio clip", async () => {
      setupAudioArrangementClipMocks();

      const result = await createClip({
        path: "t0[1|1]",
        sampleFile: "/path/to/audio.wav",
        transforms: "velocity = 100",
      });

      expect(detailOf(result)).toBe("transforms ignored: the clip is audio");
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("says nothing when the transform applies", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      const result = await createClip({
        slot: "0/0",
        notes: "C3 1|1",
        transforms: "velocity = 100",
      });

      expect(detailOf(result)).toBeUndefined();
    });
  });

  describe("dropped duplicate notes", () => {
    it("are counted on a session clip, without a warning", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      const result = await createClip(
        { slot: "0/0", notes: DUPLICATE_PAIR },
        { notation: "midi-json" },
      );

      expect(detailOf(result)).toBe(
        "dropped 1 duplicate note at the same pitch and start",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("are counted on an arrangement clip, without a warning", async () => {
      setupArrangementClipMocks();

      const result = await createClip(
        { path: "t0[3|1]", notes: DUPLICATE_PAIR },
        { notation: "midi-json" },
      );

      expect(detailOf(result)).toBe(
        "dropped 1 duplicate note at the same pitch and start",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("are counted when a transform makes them collide, once per clip", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      // Both notes land on beat 0 after the transform
      const result = await createClip(
        {
          slot: "0/0",
          notes:
            '[{"pitch":60,"start":0,"duration":1,"velocity":100},{"pitch":60,"start":1,"duration":1,"velocity":100}]',
          transforms: "timing = 0",
        },
        { notation: "midi-json" },
      );

      expect(detailOf(result)).toBe(
        "dropped 1 duplicate note at the same pitch and start",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("are counted on every clip of a multi-clip create", async () => {
      setupArrangementClipMocks();

      const result = (await createClip(
        { path: "t0[1|1],t0[3|1]", notes: DUPLICATE_PAIR },
        { notation: "midi-json" },
      )) as Array<{ detail?: string }>;

      expect(result.map((clip) => clip.detail)).toStrictEqual([
        "dropped 1 duplicate note at the same pitch and start",
        "dropped 1 duplicate note at the same pitch and start",
      ]);
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("include collisions from mixed Stark sections, in one count", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      // kick and C1 both land on MIDI 36 at beat 0
      const result = await createClip(
        { slot: "0/0", notes: "kick: X\nC1: X" },
        { notation: "stark" },
      );

      expect(detailOf(result)).toBe(
        "dropped 1 duplicate note at the same pitch and start",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("are not mentioned when there are none", async () => {
      setupSessionMocks({ liveSet: FOUR_FOUR });

      const result = await createClip({ slot: "0/0", notes: "C3 D3 1|1" });

      expect(detailOf(result)).toBeUndefined();
    });
  });
});
