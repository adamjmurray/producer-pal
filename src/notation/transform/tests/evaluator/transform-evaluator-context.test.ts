// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  applyTransforms,
  evaluateTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { type ClipContext } from "#src/notation/transform/transform-evaluator-helpers.ts";
import { createTestNotes } from "./transform-evaluator-test-helpers.ts";

describe("Context Variables", () => {
  describe("note.index", () => {
    it("resolves note.index as 0 for first note", () => {
      const result = evaluateTransform(
        "velocity = note.index",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { index: 0 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 0 });
    });

    it("resolves note.index for subsequent notes", () => {
      const result = evaluateTransform(
        "velocity = note.index",
        {
          position: 2,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { index: 3 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 3 });
    });

    it("uses note.index in arithmetic expression", () => {
      const result = evaluateTransform(
        "velocity = 60 + note.index * 5",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { index: 4 },
      );

      expect(result.velocity!.value).toBe(80);
    });

    it("increments note.index across notes in applyTransforms", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 100 },
        { start_time: 1, velocity: 100 },
        { start_time: 2, velocity: 100 },
        { start_time: 3, velocity: 100 },
      ]);

      applyTransforms(notes, "velocity = 60 + note.index * 5", 4, 4);

      expect(notes[0]!.velocity).toBe(60);
      expect(notes[1]!.velocity).toBe(65);
      expect(notes[2]!.velocity).toBe(70);
      expect(notes[3]!.velocity).toBe(75);
    });
  });

  describe("note.count", () => {
    it("resolves note.count from noteProperties", () => {
      const result = evaluateTransform(
        "velocity = note.count",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { count: 8 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 8 });
    });

    it("uses note.count in arithmetic expression", () => {
      const result = evaluateTransform(
        "velocity = 127 * note.index / (note.count - 1)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { count: 4, index: 2 },
      );

      // 127 * 2 / (4 - 1) = 254 / 3 ≈ 84.67
      expect(result.velocity!.value).toBeCloseTo(84.67, 1);
    });

    it("sets note.count from notes.length in applyTransforms", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 100 },
        { start_time: 1, velocity: 100 },
        { start_time: 2, velocity: 100 },
      ]);

      applyTransforms(notes, "velocity = note.count * 10", 4, 4);

      expect(notes[0]!.velocity).toBe(30);
      expect(notes[1]!.velocity).toBe(30);
      expect(notes[2]!.velocity).toBe(30);
    });
  });

  describe("clip.duration", () => {
    it("resolves clip.duration from noteProperties", () => {
      const result = evaluateTransform(
        "velocity = clip.duration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:duration": 16 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 16 });
    });

    it("resolves clip.duration via clipContext in applyTransforms", () => {
      const notes = createTestNotes([{ start_time: 0, velocity: 100 }]);
      const clipContext: ClipContext = {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 4,
      };

      applyTransforms(
        notes,
        "velocity = clip.duration * 10",
        4,
        4,
        clipContext,
      );

      expect(notes[0]!.velocity).toBe(80);
    });
  });

  describe("clip.index", () => {
    it("resolves clip.index from noteProperties", () => {
      const result = evaluateTransform(
        "velocity = clip.index",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:index": 2 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 2 });
    });

    it("uses clip.index for stacked fifths", () => {
      const result = evaluateTransform(
        "pitch += clip.index * 7",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:index": 3 },
      );

      expect(result.pitch).toStrictEqual({ operator: "add", value: 21 });
    });
  });

  describe("clip.count", () => {
    it("resolves clip.count from noteProperties", () => {
      const result = evaluateTransform(
        "velocity = clip.count",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:count": 5 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 5 });
    });

    it("uses clip.count for normalized fade across clips", () => {
      const result = evaluateTransform(
        "velocity = 127 * clip.index / (clip.count - 1)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:index": 2, "clip:count": 5 },
      );

      expect(result.velocity!.value).toBeCloseTo(63.5);
    });

    it("resolves clip.count via clipContext in applyTransforms", () => {
      const notes = createTestNotes([{ start_time: 0, velocity: 100 }]);
      const clipContext: ClipContext = {
        clipDuration: 8,
        clipIndex: 0,
        clipCount: 4,
        barDuration: 4,
      };

      applyTransforms(notes, "velocity = clip.count * 10", 4, 4, clipContext);

      expect(notes[0]!.velocity).toBe(40);
    });
  });

  describe("clip.position", () => {
    it("resolves clip.position when present", () => {
      const result = evaluateTransform(
        "velocity = clip.position",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 32 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 32 });
    });

    it("skips assignment when clip.position is absent (session clip)", () => {
      // When clip.position is not in noteProperties,
      // the evaluator throws and processAssignment skips with a warning
      const result = evaluateTransform(
        "velocity = clip.position",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        {},
      );

      expect(result).toStrictEqual({});
    });

    it("does not affect other assignments when clip.position is absent", () => {
      const result = evaluateTransform(
        "velocity = clip.position\npitch += 7",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        {},
      );

      // First assignment skipped, second succeeds
      expect(result.velocity).toBeUndefined();
      expect(result.pitch).toStrictEqual({ operator: "add", value: 7 });
    });
  });

  describe("clip.barDuration", () => {
    it("resolves clip.barDuration from noteProperties", () => {
      const result = evaluateTransform(
        "velocity = clip.barDuration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { "clip:barDuration": 4 },
      );

      expect(result.velocity).toStrictEqual({ operator: "set", value: 4 });
    });

    it("clip.barDuration is 4 in 4/4 via clipContext", () => {
      const notes = createTestNotes([{ start_time: 0, velocity: 100 }]);
      const clipContext: ClipContext = {
        clipDuration: 16,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 4,
      };

      applyTransforms(
        notes,
        "velocity = clip.barDuration * 10",
        4,
        4,
        clipContext,
      );

      expect(notes[0]!.velocity).toBe(40);
    });

    it("clip.barDuration is 3 in 3/4 via clipContext", () => {
      const notes = createTestNotes([{ start_time: 0, velocity: 100 }]);
      const clipContext: ClipContext = {
        clipDuration: 12,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 3,
      };

      applyTransforms(
        notes,
        "velocity = clip.barDuration * 10",
        3,
        4,
        clipContext,
      );

      expect(notes[0]!.velocity).toBe(30);
    });

    it("clip.barDuration is 6 in 6/8 via clipContext", () => {
      const notes = createTestNotes([{ start_time: 0, velocity: 100 }]);
      const clipContext: ClipContext = {
        clipDuration: 24,
        clipIndex: 0,
        clipCount: 1,
        barDuration: 6,
      };

      applyTransforms(
        notes,
        "velocity = clip.barDuration * 10",
        6,
        8,
        clipContext,
      );

      expect(notes[0]!.velocity).toBe(60);
    });
  });

  describe("sync keyword", () => {
    it("syncs waveform phase to arrangement timeline", () => {
      // Note at position 2 in a clip starting at beat 6
      // With sync: effective = 2 + 6 = 8, phase = (8/4) % 1 = 0, cos(0) = 1
      // Without sync would be: phase = (2/4) % 1 = 0.5, cos(0.5) = -1
      const result = evaluateTransform(
        "velocity += 100 * cos(4t, sync)",
        { position: 2, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 6 },
      );

      expect(result.velocity!.value).toBeCloseTo(100, 10);
    });

    it("combines sync with phase offset", () => {
      // Effective position = 0 + 4 = 4, period = 4, basePhase = (4/4) % 1 = 0
      // With phase offset 0.25, phase = 0.25, cos(0.25) ≈ 0
      const result = evaluateTransform(
        "velocity += 100 * cos(4t, 0.25, sync)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 4 },
      );

      expect(result.velocity!.value).toBeCloseTo(0, 10);
    });

    it("skips assignment when sync used on session clip", () => {
      const result = evaluateTransform(
        "velocity += 100 * cos(4t, sync)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        {},
      );

      expect(result).toStrictEqual({});
    });

    it("does not affect other assignments when sync fails", () => {
      const result = evaluateTransform(
        "velocity += 100 * cos(4t, sync)\npitch += 7",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        {},
      );

      expect(result.velocity).toBeUndefined();
      expect(result.pitch).toStrictEqual({ operator: "add", value: 7 });
    });

    it("without sync, phase is clip-relative", () => {
      // Position 2, period 4 → phase = (2/4) % 1 = 0.5, cos(0.5) = -1
      // clip.position is ignored when sync is not used
      const result = evaluateTransform(
        "velocity += 100 * cos(4t)",
        { position: 2, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 8 },
      );

      expect(result.velocity!.value).toBeCloseTo(-100, 10);
    });

    it("sync at position 0 with clip.position 0 matches default", () => {
      const synced = evaluateTransform(
        "velocity += 100 * cos(4t, sync)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 0 },
      );
      const unsynced = evaluateTransform(
        "velocity += 100 * cos(4t)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 0 },
      );

      expect(synced.velocity!.value).toBeCloseTo(unsynced.velocity!.value, 10);
    });

    it("works with tri waveform", () => {
      // Effective position = 0 + 2 = 2, period = 4, phase = 0.5
      // tri(0.5) = 0.0
      const result = evaluateTransform(
        "velocity += 100 * tri(4t, sync)",
        { position: 0, timeSig: { numerator: 4, denominator: 4 } },
        { "clip:position": 2 },
      );

      expect(result.velocity!.value).toBeCloseTo(0, 10);
    });

    it("works with applyTransforms and clipContext", () => {
      const notes = createTestNotes([
        { start_time: 0, velocity: 100 },
        { start_time: 1, velocity: 100 },
      ]);
      const clipContext: ClipContext = {
        clipDuration: 4,
        clipIndex: 0,
        clipCount: 1,
        arrangementStart: 4,
        barDuration: 4,
      };

      // Note 0: pos=0, effective=4, phase=(4/4)%1=0, cos(0)=1 → 100+50=127 (clamped)
      // Note 1: pos=1, effective=5, phase=(5/4)%1=0.25, cos(0.25)≈0 → ≈100
      applyTransforms(
        notes,
        "velocity += 50 * cos(4t, sync)",
        4,
        4,
        clipContext,
      );

      expect(notes[0]!.velocity).toBe(127);
      expect(notes[1]!.velocity).toBeCloseTo(100, 0);
    });
  });

  describe("context variable errors", () => {
    it("errors when clip variable is not available", () => {
      const result = evaluateTransform(
        "velocity = clip.duration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        {},
      );

      expect(result).toStrictEqual({});
    });

    it("errors when clip.barDuration is not available", () => {
      const result = evaluateTransform(
        "velocity = clip.barDuration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        {},
      );

      expect(result).toStrictEqual({});
    });
  });
});
