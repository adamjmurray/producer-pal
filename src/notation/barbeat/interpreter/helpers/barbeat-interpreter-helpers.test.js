import { describe, expect, it } from "vitest";
import {
  clearPitchBuffer,
  trackStateChange,
  updateBufferedPitches,
} from "./barbeat-interpreter-buffer-helpers.js";
import { copyNoteToDestination } from "./barbeat-interpreter-copy-helpers.js";

describe("barbeat-interpreter-helpers", () => {
  describe("clearPitchBuffer", () => {
    it("clears pitch buffer and resets flags", () => {
      const state = {
        currentPitches: [{ pitch: 60 }, { pitch: 64 }],
        pitchGroupStarted: true,
        pitchesEmitted: true,
        stateChangedSinceLastPitch: true,
        stateChangedAfterEmission: true,
      };

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
      const sourceNote = {
        pitch: 60,
        relativeTime: 1.5,
        duration: 0.5,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      };
      const destBar = 2;
      const destinationBarStart = 8.0;
      const events = [];
      const notesByBar = new Map();

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
      expect(notesByBar.get(destBar)).toHaveLength(1);
      expect(notesByBar.get(destBar)[0].relativeTime).toBe(1.5);
      expect(notesByBar.get(destBar)[0].originalBar).toBe(2);
    });

    it("appends to existing notes in notesByBar", () => {
      const sourceNote = {
        pitch: 64,
        relativeTime: 0,
        duration: 1.0,
        velocity: 80,
        probability: 1.0,
        velocity_deviation: 10,
      };
      const destBar = 1;
      const destinationBarStart = 4.0;
      const events = [];
      const notesByBar = new Map();

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

      expect(notesByBar.get(destBar)).toHaveLength(2);
      expect(notesByBar.get(destBar)[0].pitch).toBe(64);
      expect(notesByBar.get(destBar)[1].pitch).toBe(67);
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
      };

      trackStateChange(state, (s) => {
        s.velocity = 80;
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
      };

      trackStateChange(state, (s) => {
        s.duration = 0.5;
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
      };

      trackStateChange(state, (s) => {
        s.velocity = 90;
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
      };

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.currentPitches[0].velocity).toBe(80);
      expect(state.currentPitches[1].velocity).toBe(80);
      expect(state.stateChangedAfterEmission).toBe(true);
    });

    it("does not update pitches when pitch group started", () => {
      const state = {
        pitchGroupStarted: true,
        currentPitches: [{ velocity: 100 }, { velocity: 100 }],
        stateChangedAfterEmission: false,
      };

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.currentPitches[0].velocity).toBe(100);
      expect(state.currentPitches[1].velocity).toBe(100);
      expect(state.stateChangedAfterEmission).toBe(false);
    });

    it("does not update when no buffered pitches", () => {
      const state = {
        pitchGroupStarted: false,
        currentPitches: [],
        stateChangedAfterEmission: false,
      };

      updateBufferedPitches(state, (pitchState) => {
        pitchState.velocity = 80;
      });

      expect(state.stateChangedAfterEmission).toBe(false);
    });
  });
});
