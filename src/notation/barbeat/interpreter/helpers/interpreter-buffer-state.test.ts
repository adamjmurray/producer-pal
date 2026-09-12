// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { defaultBufferState } from "./barbeat-interpreter-test-helpers.ts";
import {
  type BufferState,
  type InterpreterState,
  clearCarriedStreams,
  clearPitchBuffer,
  clearValueStreams,
  validateBufferedState,
} from "./interpreter-buffer-state.ts";

describe("interpreter-buffer-state", () => {
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

    // The state-change warning fires for a mid-group change (both flags) or for
    // any change after emission.
    it.each([
      [{ stateChangedSinceLastPitch: true, pitchGroupStarted: true }],
      [{ stateChangedAfterEmission: true }],
    ])("warns about a wasted state change for %o", (flags) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      validateBufferedState({ ...defaultBufferState, ...flags }, "test-op");

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("state change won't affect anything"),
      );
      warn.mockRestore();
    });

    it("stays silent for a state change before any pitch group started", () => {
      // Nothing is wasted yet — the next pitch group picks the change up. This
      // isolates the `&& pitchGroupStarted` conjunct from the warning above.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const state: BufferState = {
        ...defaultBufferState,
        stateChangedSinceLastPitch: true,
        pitchGroupStarted: false,
      };

      validateBufferedState(state, "test-op");

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
