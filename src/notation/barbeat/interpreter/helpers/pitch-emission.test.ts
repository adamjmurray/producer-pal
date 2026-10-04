// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { type InterpreterState } from "./interpreter-buffer-state.ts";
import { handlePitchEmission } from "./pitch-emission.ts";

/**
 * A fresh interpreter state at 2|3.
 * @param overrides - Fields to change
 * @returns The state
 */
function makeState(
  overrides: Partial<InterpreterState> = {},
): InterpreterState {
  return {
    currentTime: { bar: 2, beat: 3 },
    currentVelocity: 100,
    currentDuration: 1,
    currentPitches: [],
    currentPitchStreams: [],
    pitchStreamCursor: 0,
    velocityStreamCursor: 0,
    durationStreamCursor: 0,
    probabilityStreamCursor: 0,
    pitchGroupStarted: false,
    pitchesEmitted: false,
    stateChangedSinceLastPitch: false,
    stateChangedAfterEmission: false,
    ...overrides,
  };
}

describe("handlePitchEmission with no positions", () => {
  it("warns about nothing when there are no pitches either", () => {
    const state = makeState();
    const events: NoteEvent[] = [];

    handlePitchEmission([], state, 4, 4, events, new Map());

    expect(events).toStrictEqual([]);
    expect(capturedWarnings()).toStrictEqual([]);
    expect(state.pitchesEmitted).toBe(false);
  });

  it("emits nothing and keeps the current time", () => {
    const state = makeState({
      currentPitches: [
        { pitch: 60, velocity: 100, velocityDeviation: 0, duration: 1 },
      ],
    });
    const events: NoteEvent[] = [];

    handlePitchEmission([], state, 4, 4, events, new Map());

    expect(events).toStrictEqual([]);
    expect(state.currentTime).toStrictEqual({ bar: 2, beat: 3 });
    expect(state.pitchesEmitted).toBe(true);
  });
});
