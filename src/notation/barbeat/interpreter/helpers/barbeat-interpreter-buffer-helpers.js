import * as console from "#src/shared/v8-max-console.js";

/**
 * @typedef {object} PitchState
 * @property {number} pitch - MIDI pitch
 * @property {number} velocity - Velocity (0-127)
 * @property {number} velocityDeviation - Velocity deviation
 * @property {number} duration - Duration in beats
 * @property {number} [probability] - Probability (0.0-1.0)
 */

/**
 * @typedef {object} TimePosition
 * @property {number} bar - Bar number
 * @property {number} beat - Beat number
 */

/**
 * @typedef {object} InterpreterState
 * @property {TimePosition} currentTime - Current time position
 * @property {number | null} currentVelocity - Current velocity
 * @property {number} currentDuration - Current duration
 * @property {number} [currentProbability] - Current probability
 * @property {number | null} [currentVelocityMin] - Current velocity range minimum
 * @property {number | null} [currentVelocityMax] - Current velocity range maximum
 * @property {boolean} hasExplicitBarNumber - Whether bar number was explicit
 * @property {Array<PitchState>} currentPitches - Buffered pitches
 * @property {boolean} pitchGroupStarted - Whether a pitch group has started
 * @property {boolean} pitchesEmitted - Whether pitches were emitted
 * @property {boolean} stateChangedSinceLastPitch - State change tracking
 * @property {boolean} stateChangedAfterEmission - State change tracking
 */

/**
 * @typedef {object} BufferState
 * @property {Array<PitchState>} currentPitches - Buffered pitches
 * @property {boolean} pitchesEmitted - Whether pitches were emitted
 * @property {boolean} stateChangedSinceLastPitch - State change tracking
 * @property {boolean} pitchGroupStarted - Whether a pitch group has started
 * @property {boolean} stateChangedAfterEmission - State change tracking
 */

/**
 * @typedef {object} BarCopyResult
 * @property {TimePosition | null} currentTime - New time position
 * @property {boolean} hasExplicitBarNumber - Whether bar number was explicit
 */

/**
 * Clear pitch buffer and reset all pitch-related flags
 * @param {InterpreterState} state - State object containing pitch buffer and flags
 */
export function clearPitchBuffer(state) {
  state.currentPitches = [];
  state.pitchGroupStarted = false;
  state.pitchesEmitted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
}

/**
 * Validate buffered state before an operation and warn if needed
 * @param {BufferState} state - State object
 * @param {string} operationType - Type of operation (for warning message)
 */
export function validateBufferedState(state, operationType) {
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
 * @param {InterpreterState} state - State object
 * @param {(state: InterpreterState) => void} updateFn - Function that updates the state
 */
export function trackStateChange(state, updateFn) {
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
 * @param {InterpreterState} state - State object
 * @param {(pitchState: PitchState) => void} updateFn - Function that updates a single pitch state
 */
export function updateBufferedPitches(state, updateFn) {
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
 * @param {InterpreterState} state - State object
 * @param {(pitchState: PitchState) => void} pitchUpdater - Function that updates a single pitch state
 */
export function handlePropertyUpdate(state, pitchUpdater) {
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
 * @param {InterpreterState} state - Interpreter state object
 * @returns {BufferState} Snapshot of buffer-related state
 */
export function extractBufferState(state) {
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
 * @param {InterpreterState} state - Interpreter state object
 * @param {BarCopyResult} result - Result from bar copy handler
 */
export function applyBarCopyResult(state, result) {
  if (result.currentTime) {
    state.currentTime = result.currentTime;
    state.hasExplicitBarNumber = result.hasExplicitBarNumber;
  }
}
