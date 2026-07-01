// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

export interface PitchState {
  pitch: number;
  velocity: number;
  velocityDeviation: number;
  duration: number;
  probability?: number;
}

/** One resolved velocity stream value (a single velocity or a range). */
export interface StreamVelocityValue {
  velocity: number;
  velocityDeviation: number;
}

export interface TimePosition {
  bar: number;
  beat: number;
}

export interface InterpreterState {
  currentTime: TimePosition;
  currentVelocity: number | null;
  currentDuration: number;
  currentProbability?: number;
  currentVelocityMin?: number | null;
  currentVelocityMax?: number | null;
  currentPitches: PitchState[];
  /**
   * Active pitch "voices" within the current group (pattern brackets): a list of
   * voices, each a list of chords cycled across emitted note-events. Pitch
   * brackets LAYER — multiple voices stack into a chord at each emission, each
   * voice cycling by its own length against the shared cursor. Empty `[]` ⇒ no
   * active brackets, so emission uses only the single `currentPitches` chord.
   * Voices accumulate only WITHIN a group (tokens before the group's first time
   * position); they PERSIST across separate time positions (cross-event cursor)
   * and clear on the next group start, `@clear`, or bar copy. (Velocity/
   * duration/probability stay single last-wins streams — stacking those is
   * meaningless; stacking pitches is a chord.)
   */
  currentPitchStreams: PitchState[][][];
  /**
   * Shared cursor into every pitch voice, advanced once per emitted note-event
   * and carried across separate time positions. The chord emitted at index `i`
   * is the union over all voices of `voice[(cursor + i) mod voice.length]`. Reset
   * to 0 at each group start. Harmless for the length-1 fallback (`cursor mod 1`
   * is always 0), so it can advance unconditionally.
   */
  pitchStreamCursor: number;
  /**
   * Active value streams for velocity/duration/probability (pattern
   * brackets). When non-null, the stream OVERRIDES the captured per-pitch value
   * at emission, cycled by its own cursor; when null, emission uses the value
   * captured into each PitchState (the legacy per-pitch scalar). Durations are
   * stored in musical beats. Each persists until its parameter is reassigned (a
   * later scalar or bracket), independent of the pitch stream.
   */
  currentVelocityStream?: StreamVelocityValue[] | null;
  velocityStreamCursor: number;
  currentDurationStream?: number[] | null;
  durationStreamCursor: number;
  currentProbabilityStream?: number[] | null;
  probabilityStreamCursor: number;
  pitchGroupStarted: boolean;
  pitchesEmitted: boolean;
  stateChangedSinceLastPitch: boolean;
  stateChangedAfterEmission: boolean;
}

export interface BufferState {
  currentPitches: PitchState[];
  currentPitchStreams: PitchState[][][];
  pitchesEmitted: boolean;
  stateChangedSinceLastPitch: boolean;
  pitchGroupStarted: boolean;
  stateChangedAfterEmission: boolean;
}

export interface BarCopyResult {
  currentTime: TimePosition | null;
}

/**
 * Clear pitch buffer and reset all pitch-related flags
 * @param state - Interpreter state to clear
 */
export function clearPitchBuffer(state: InterpreterState): void {
  state.currentPitches = [];
  state.currentPitchStreams = [];
  state.pitchStreamCursor = 0;
  state.pitchGroupStarted = false;
  state.pitchesEmitted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
}

/**
 * Drop all carried VALUE streams (velocity/duration/probability) and rewind
 * their cursors. Companion to {@link clearPitchBuffer}: a `[...]` value stream
 * carries across emitted positions by its own cursor exactly as a
 * pitch stream does, so the operations that forget the carried pitch stream
 * (`@clear`, bar copy) must forget the carried value streams too — otherwise a
 * velocity/duration/probability stream keeps cycling past a `@clear` that wiped
 * the pitch carry, an undocumented asymmetry.
 * @param state - Interpreter state to clear
 */
export function clearValueStreams(state: InterpreterState): void {
  state.currentVelocityStream = null;
  state.velocityStreamCursor = 0;
  state.currentDurationStream = null;
  state.durationStreamCursor = 0;
  state.currentProbabilityStream = null;
  state.probabilityStreamCursor = 0;
}

/**
 * Forget ALL carried stream state — the pitch buffer/stream and every value
 * stream — symmetrically. This is what `@clear` and bar copy do: they reset the
 * carry so a following time position with no fresh pitch/value emits nothing
 * (pitch) / falls back to the last scalar (value), rather than resuming a
 * mid-cycle stream.
 * @param state - Interpreter state to clear
 */
export function clearCarriedStreams(state: InterpreterState): void {
  clearPitchBuffer(state);
  clearValueStreams(state);
}

/**
 * Count un-emitted buffered pitches across the single `currentPitches` chord and
 * every pending pitch voice (summed over each voice's chords). Used by the
 * "buffered but not emitted" warnings so dangling pattern brackets are reported
 * like a dangling chord.
 * @param state - Buffer/interpreter state to inspect
 * @returns Total pitch count buffered (chord + all voices)
 */
export function countBufferedPitches(
  state: Pick<BufferState, "currentPitches" | "currentPitchStreams">,
): number {
  const streamCount = state.currentPitchStreams.reduce(
    (sum, voice) =>
      sum + voice.reduce((voiceSum, chord) => voiceSum + chord.length, 0),
    0,
  );

  return state.currentPitches.length + streamCount;
}

/**
 * Validate buffered state before an operation and warn if needed
 * @param state - Buffer state to validate
 * @param operationType - Type of operation for warning messages
 */
export function validateBufferedState(
  state: BufferState,
  operationType: string,
): void {
  // Warn if pitches or state buffered but not emitted (a pending pitch stream
  // counts as buffered un-emitted state, same as a dangling chord).
  const buffered = countBufferedPitches(state);

  if (buffered > 0 && !state.pitchesEmitted) {
    console.warn(
      `${buffered} pitch(es) buffered but not emitted before ${operationType}`,
    );
  }

  if (
    (state.stateChangedSinceLastPitch && state.pitchGroupStarted) ||
    state.stateChangedAfterEmission
  ) {
    console.warn(`state change won't affect anything before ${operationType}`);
  }
}

/**
 * Handle a property update (velocity, duration, probability, etc.)
 * Tracks state changes and updates buffered pitches if needed.
 * @param state - Interpreter state
 * @param pitchUpdater - Function to update each pitch state
 */
export function handlePropertyUpdate(
  state: InterpreterState,
  pitchUpdater: (pitchState: PitchState) => void,
): void {
  const buffered = countBufferedPitches(state);

  // Scalar lands mid-group — after the pitch token(s) but before that group's
  // first time position (`[C3 E3] v80 1|1`, or the bare `C3 E3 v80 1|1`). It
  // can't change the already-captured group, so flag it for the "won't affect
  // this group" warning. A buffered pattern bracket counts as group pitches
  // here too. (Only scalars reach this path; value streams bypass it, so
  // reassigning a value stream after a pitch stream stays warning-free.)
  if (state.pitchGroupStarted && buffered > 0) {
    state.stateChangedSinceLastPitch = true;
  }

  // Scalar lands after emission, on the carried pitch buffer (`C1 1|1 v80
  // 1|2`): retroactively update the carried bare pitches AND a carried pitch
  // stream's captured values, so a length-1 stream stays exactly a bare pitch
  // (`[C1] 1|1 v80 1|2` == `C1 1|1 v80 1|2`). For a multi-value stream every
  // captured value updates, so emissions at and after the scalar reflect it —
  // matching how a carried chord updates all its pitches.
  if (!state.pitchGroupStarted && buffered > 0) {
    applyToBufferedPitches(state, pitchUpdater);
    state.stateChangedAfterEmission = true;
  }

  if (!state.pitchGroupStarted && buffered === 0) {
    state.stateChangedAfterEmission = true;
  }
}

/**
 * Apply an update to every buffered pitch state — the single carried chord
 * (`currentPitches`) and every chord of every carried pitch voice
 * (`currentPitchStreams`). Lets a post-emission scalar retroactively update
 * carried voices the same way it updates a carried bare pitch.
 * @param state - Interpreter state holding the buffered pitches
 * @param pitchUpdater - Function to mutate each pitch state
 */
function applyToBufferedPitches(
  state: InterpreterState,
  pitchUpdater: (pitchState: PitchState) => void,
): void {
  for (const pitchState of state.currentPitches) {
    pitchUpdater(pitchState);
  }

  for (const voice of state.currentPitchStreams) {
    for (const chord of voice) {
      for (const pitchState of chord) {
        pitchUpdater(pitchState);
      }
    }
  }
}

/**
 * Extract buffer state snapshot for bar copy operations
 * @param state - Interpreter state to extract from
 * @returns Buffer state snapshot
 */
export function extractBufferState(state: InterpreterState): BufferState {
  return {
    currentPitches: state.currentPitches,
    currentPitchStreams: state.currentPitchStreams,
    pitchesEmitted: state.pitchesEmitted,
    stateChangedSinceLastPitch: state.stateChangedSinceLastPitch,
    pitchGroupStarted: state.pitchGroupStarted,
    stateChangedAfterEmission: state.stateChangedAfterEmission,
  };
}
