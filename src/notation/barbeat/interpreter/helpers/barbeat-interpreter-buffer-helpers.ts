import * as console from "#src/shared/v8-max-console.js";

export interface PitchState {
  pitch: number;
  velocity: number;
  velocityDeviation: number;
  duration: number;
  probability?: number;
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
  hasExplicitBarNumber: boolean;
  currentPitches: PitchState[];
  pitchGroupStarted: boolean;
  pitchesEmitted: boolean;
  stateChangedSinceLastPitch: boolean;
  stateChangedAfterEmission: boolean;
}

export interface BufferState {
  currentPitches: PitchState[];
  pitchesEmitted: boolean;
  stateChangedSinceLastPitch: boolean;
  pitchGroupStarted: boolean;
  stateChangedAfterEmission: boolean;
}

export interface BarCopyResult {
  currentTime: TimePosition | null;
  hasExplicitBarNumber: boolean;
}

/**
 * Clear pitch buffer and reset all pitch-related flags
 * @param state - Interpreter state to clear
 */
export function clearPitchBuffer(state: InterpreterState): void {
  state.currentPitches = [];
  state.pitchGroupStarted = false;
  state.pitchesEmitted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
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
  // Warn if pitches or state buffered but not emitted
  if (state.currentPitches.length > 0 && !state.pitchesEmitted) {
    console.error(
      `Warning: ${state.currentPitches.length} pitch(es) buffered but not emitted before ${operationType}`,
    );
  }

  if (
    (state.stateChangedSinceLastPitch && state.pitchGroupStarted) ||
    state.stateChangedAfterEmission
  ) {
    console.error(
      `Warning: state change won't affect anything before ${operationType}`,
    );
  }
}

/**
 * Track state changes and update buffered pitches
 * @param state - Interpreter state to track
 * @param updateFn - Function to apply state update
 */
export function trackStateChange(
  state: InterpreterState,
  updateFn: (state: InterpreterState) => void,
): void {
  // Apply the state update
  updateFn(state);

  // Track if state changed after pitch in current group
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }

  // Track wasted state changes (after emission, before pitches)
  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
  }
}

/**
 * Update buffered pitches with new state values
 * @param state - Interpreter state containing buffered pitches
 * @param updateFn - Function to update each pitch state
 */
export function updateBufferedPitches(
  state: InterpreterState,
  updateFn: (pitchState: PitchState) => void,
): void {
  // Update buffered pitches if after time position
  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      updateFn(pitchState);
    }

    // State changes applied to buffered pitches could be wasted if bar copy occurs
    state.stateChangedAfterEmission = true;
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
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }

  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      pitchUpdater(pitchState);
    }

    state.stateChangedAfterEmission = true;
  }

  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
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
    pitchesEmitted: state.pitchesEmitted,
    stateChangedSinceLastPitch: state.stateChangedSinceLastPitch,
    pitchGroupStarted: state.pitchGroupStarted,
    stateChangedAfterEmission: state.stateChangedAfterEmission,
  };
}

/**
 * Apply bar copy result to interpreter state
 * @param state - Interpreter state to update
 * @param result - Bar copy result to apply
 */
export function applyBarCopyResult(
  state: InterpreterState,
  result: BarCopyResult,
): void {
  if (result.currentTime) {
    state.currentTime = result.currentTime;
    state.hasExplicitBarNumber = result.hasExplicitBarNumber;
  }
}
