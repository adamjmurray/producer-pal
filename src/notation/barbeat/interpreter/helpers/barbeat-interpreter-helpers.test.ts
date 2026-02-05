// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { BarCopyNote, NoteEvent } from "#src/notation/types.ts";
import type { InterpreterState } from "./barbeat-interpreter-buffer-helpers.ts";
import {
  clearPitchBuffer,
  trackStateChange,
  updateBufferedPitches,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  copyNoteToDestination,
  handleBarCopySingleDestination,
} from "./barbeat-interpreter-copy-helpers.ts";
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

  describe("trackStateChange", () => {
    it("updates state and sets stateChangedSinceLastPitch when pitch group started", () => {
      const state = {
        pitchGroupStarted: true,
        currentPitches: [{ pitch: 60 }],
        stateChangedSinceLastPitch: false,
        stateChangedAfterEmission: false,
        velocity: 100,
      } as unknown as InterpreterState & { velocity: number };

      trackStateChange(state, (s) => {
        (s as typeof state).velocity = 80;
      });

      expect(state.velocity).toBe(80);
      expect(state.stateChangedSinceLastPitch).toBe(true);
    });

    it("sets stateChangedAfterEmission when no pitches buffered", () => {
      const state = {
        pitchGroupStarted: false,
        currentPitches: [],
        stateChangedSinceLastPitch: false,
        stateChangedAfterEmission: false,
        duration: 1.0,
      } as unknown as InterpreterState & { duration: number };

      trackStateChange(state, (s) => {
        (s as typeof state).duration = 0.5;
      });

      expect(state.duration).toBe(0.5);
      expect(state.stateChangedAfterEmission).toBe(true);
    });

    it("does not set flags when pitch group not started and pitches exist", () => {
      const state = {
        pitchGroupStarted: false,
        currentPitches: [{ pitch: 60 }],
        stateChangedSinceLastPitch: false,
        stateChangedAfterEmission: false,
        velocity: 100,
      } as unknown as InterpreterState & { velocity: number };

      trackStateChange(state, (s) => {
        (s as typeof state).velocity = 90;
      });

      expect(state.velocity).toBe(90);
      expect(state.stateChangedSinceLastPitch).toBe(false);
      expect(state.stateChangedAfterEmission).toBe(false);
    });
  });

  describe("updateBufferedPitches", () => {
    it("updates buffered pitches when not in pitch group", () => {
      const state = {
        pitchGroupStarted: false,
        currentPitches: [{ velocity: 100 }, { velocity: 100 }],
        stateChangedAfterEmission: false,
      } as unknown as InterpreterState;

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.currentPitches[0]!.velocity).toBe(80);
      expect(state.currentPitches[1]!.velocity).toBe(80);
      expect(state.stateChangedAfterEmission).toBe(true);
    });

    it("does not update pitches when pitch group started", () => {
      const state = {
        pitchGroupStarted: true,
        currentPitches: [{ velocity: 100 }, { velocity: 100 }],
        stateChangedAfterEmission: false,
      } as unknown as InterpreterState;

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.currentPitches[0]!.velocity).toBe(100);
      expect(state.currentPitches[1]!.velocity).toBe(100);
      expect(state.stateChangedAfterEmission).toBe(false);
    });

    it("does not update when no buffered pitches", () => {
      const state = {
        pitchGroupStarted: false,
        currentPitches: [],
        stateChangedAfterEmission: false,
      } as unknown as InterpreterState;

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.stateChangedAfterEmission).toBe(false);
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
        hasExplicitBarNumber: true,
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.start_time).toBe(4); // Bar 2 starts at beat 4
    });
  });
});
