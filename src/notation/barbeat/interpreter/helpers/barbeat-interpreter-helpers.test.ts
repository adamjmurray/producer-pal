// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type BarCopyNote, type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  type BufferState,
  type InterpreterState,
  clearCarriedStreams,
  clearPitchBuffer,
  clearValueStreams,
  validateBufferedState,
} from "./barbeat-interpreter-buffer-helpers.ts";
import { copyNoteToDestination } from "./barbeat-interpreter-copy-bar-helpers.ts";
import { handleBarCopySingleDestination } from "./barbeat-interpreter-copy-helpers.ts";
import {
  defaultBufferState,
  testRangeCopyFailure,
  testSingleCopyFailure,
  testSingleCopyNullResult,
} from "./barbeat-interpreter-test-helpers.ts";

describe("barbeat-interpreter-helpers", () => {
  describe("clearPitchBuffer", () => {
    it("clears pitch buffer and resets flags", () => {
      const state = {
        currentPitches: [{ pitch: 60 }, { pitch: 64 }],
        pitchGroupStarted: true,
        pitchesEmitted: true,
        stateChangedSinceLastPitch: true,
        stateChangedAfterEmission: true,
      } as unknown as InterpreterState;

      clearPitchBuffer(state);

      expect(state.currentPitches).toStrictEqual([]);
      expect(state.pitchGroupStarted).toBe(false);
      expect(state.pitchesEmitted).toBe(false);
      expect(state.stateChangedSinceLastPitch).toBe(false);
      expect(state.stateChangedAfterEmission).toBe(false);
    });
  });

  describe("clearValueStreams", () => {
    it("nulls every value stream and rewinds its cursor", () => {
      const state = {
        currentVelocityStream: [{ velocity: 80, velocityDeviation: 0 }],
        velocityStreamCursor: 3,
        currentDurationStream: [1, 2],
        durationStreamCursor: 5,
        currentProbabilityStream: [0.5],
        probabilityStreamCursor: 7,
      } as unknown as InterpreterState;

      clearValueStreams(state);

      expect(state.currentVelocityStream).toBeNull();
      expect(state.velocityStreamCursor).toBe(0);
      expect(state.currentDurationStream).toBeNull();
      expect(state.durationStreamCursor).toBe(0);
      expect(state.currentProbabilityStream).toBeNull();
      expect(state.probabilityStreamCursor).toBe(0);
    });
  });

  describe("clearCarriedStreams", () => {
    it("forgets both the pitch buffer and every value stream", () => {
      const state = {
        currentPitches: [{ pitch: 60 }],
        currentPitchStreams: [[[{ pitch: 60 }]]],
        pitchStreamCursor: 2,
        pitchGroupStarted: true,
        pitchesEmitted: true,
        stateChangedSinceLastPitch: true,
        stateChangedAfterEmission: true,
        currentVelocityStream: [{ velocity: 80, velocityDeviation: 0 }],
        velocityStreamCursor: 3,
        currentDurationStream: [1, 2],
        durationStreamCursor: 5,
        currentProbabilityStream: [0.5],
        probabilityStreamCursor: 7,
      } as unknown as InterpreterState;

      clearCarriedStreams(state);

      expect(state.currentPitches).toStrictEqual([]);
      expect(state.currentPitchStreams).toStrictEqual([]);
      expect(state.pitchStreamCursor).toBe(0);
      expect(state.currentVelocityStream).toBeNull();
      expect(state.currentDurationStream).toBeNull();
      expect(state.currentProbabilityStream).toBeNull();
      expect(state.velocityStreamCursor).toBe(0);
      expect(state.durationStreamCursor).toBe(0);
      expect(state.probabilityStreamCursor).toBe(0);
    });
  });

  describe("copyNoteToDestination", () => {
    it("copies note to destination bar and updates events", () => {
      const sourceNote: BarCopyNote = {
        pitch: 60,
        start_time: 0,
        relativeTime: 1.5,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
        originalBar: 1,
      };
      const destBar = 2;
      const destinationBarStart = 8.0;
      const events: NoteEvent[] = [];
      const notesByBar = new Map<number, BarCopyNote[]>();

      copyNoteToDestination(
        sourceNote,
        destBar,
        destinationBarStart,
        events,
        notesByBar,
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toStrictEqual({
        pitch: 60,
        start_time: 9.5,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });

      expect(notesByBar.has(destBar)).toBe(true);
      expect(notesByBar.get(destBar)!).toHaveLength(1);
      expect(notesByBar.get(destBar)![0]!.relativeTime).toBe(1.5);
      expect(notesByBar.get(destBar)![0]!.originalBar).toBe(2);
    });

    it("appends to existing notes in notesByBar", () => {
      const sourceNote: BarCopyNote = {
        pitch: 64,
        start_time: 0,
        relativeTime: 0,
        duration: 1.0,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 10,
        originalBar: 1,
      };
      const destBar = 1;
      const destinationBarStart = 4.0;
      const events: NoteEvent[] = [];
      const notesByBar = new Map<number, BarCopyNote[]>();

      // Add first note
      copyNoteToDestination(
        sourceNote,
        destBar,
        destinationBarStart,
        events,
        notesByBar,
      );

      // Add second note
      copyNoteToDestination(
        { ...sourceNote, pitch: 67 },
        destBar,
        destinationBarStart,
        events,
        notesByBar,
      );

      expect(notesByBar.get(destBar)!).toHaveLength(2);
      expect(notesByBar.get(destBar)![0]!.pitch).toBe(64);
      expect(notesByBar.get(destBar)![1]!.pitch).toBe(67);
    });
  });

  describe("handleBarCopyRangeDestination", () => {
    it("returns null when destination start is zero or negative", () => {
      expect(
        testRangeCopyFailure({
          element: { source: "previous", destination: { range: [0, 2] } },
          errorContains: "Invalid destination range",
        }),
      ).toBe(true);
    });

    it("returns null when source bar is zero or negative", () => {
      expect(
        testRangeCopyFailure({
          element: { source: { bar: 0 }, destination: { range: [2, 3] } },
          errorContains: "Cannot copy from bar 0",
        }),
      ).toBe(true);
    });

    it("returns null when source range has invalid bar numbers", () => {
      expect(
        testRangeCopyFailure({
          element: {
            source: { range: [0, 2] },
            destination: { range: [5, 6] },
          },
          errorContains: "Invalid source range @5-6=0-2",
        }),
      ).toBe(true);
    });

    it("returns null when source range start is greater than end", () => {
      expect(
        testRangeCopyFailure({
          element: {
            source: { range: [5, 2] },
            destination: { range: [8, 10] },
          },
          errorContains: "Invalid source range @8-10=5-2 (start > end)",
        }),
      ).toBe(true);
    });

    it("returns null when all destination bars match source bar", () => {
      const notesByBar = new Map();

      notesByBar.set(2, [{ pitch: 60, relativeTime: 0, duration: 1 }]);
      expect(
        testRangeCopyFailure({
          element: { source: { bar: 2 }, destination: { range: [2, 2] } },
          errorContains: "Skipping copy of bar 2 to itself",
          notesByBar,
        }),
      ).toBe(true);
    });
  });

  describe("handleBarCopySingleDestination", () => {
    it("returns null when source range has invalid bar numbers", () => {
      expect(
        testSingleCopyFailure({
          element: { source: { range: [0, 2] }, destination: { bar: 5 } },
          errorContains: "Cannot copy from range 0-2 (invalid bar numbers)",
        }),
      ).toBe(true);
    });

    it("returns null when source range start is greater than end", () => {
      expect(
        testSingleCopyFailure({
          element: { source: { range: [5, 2] }, destination: { bar: 8 } },
          errorContains: "Invalid source range 5-2 (start > end)",
        }),
      ).toBe(true);
    });

    it("returns null when source is invalid (no bar, range, or previous)", () => {
      expect(
        testSingleCopyNullResult({
          element: { source: {}, destination: { bar: 2 } },
        }),
      ).toBe(true);
    });

    it("returns null when no notes were copied from source bar", () => {
      expect(
        testSingleCopyNullResult({
          element: { source: { bar: 1 }, destination: { bar: 2 } },
        }),
      ).toBe(true);
    });

    it("copies notes when source bar has content", () => {
      const notesByBar = new Map<number, BarCopyNote[]>();

      notesByBar.set(1, [
        {
          pitch: 60,
          start_time: 0,
          relativeTime: 0,
          duration: 1,
          velocity: 100,
          originalBar: 1,
        },
      ]);

      const events: NoteEvent[] = [];
      const element = { source: { bar: 1 }, destination: { bar: 2 } };

      const result = handleBarCopySingleDestination(
        element,
        4, // beatsPerBar
        4, // timeSigDenominator
        notesByBar,
        events,
        defaultBufferState,
      );

      expect(result).toStrictEqual({
        currentTime: { bar: 2, beat: 1 },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.start_time).toBe(4); // Bar 2 starts at beat 4
    });
  });

  describe("validateBufferedState", () => {
    it("does not warn when nothing is buffered, even if pitches were not emitted", () => {
      // buffered === 0 isolates the `buffered > 0` guard: a `>= 0` mutant would
      // warn here because !pitchesEmitted is true.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const state: BufferState = {
        ...defaultBufferState,
        pitchesEmitted: false,
      };

      validateBufferedState(state, "test-op");

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("warns when pitches are buffered but not emitted", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const state: BufferState = {
        ...defaultBufferState,
        currentPitches: [
          { pitch: 60, velocity: 100, velocityDeviation: 0, duration: 1 },
        ],
        pitchesEmitted: false,
      };

      validateBufferedState(state, "test-op");

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("1 pitch(es) buffered but not emitted"),
      );
      warn.mockRestore();
    });
  });
});
