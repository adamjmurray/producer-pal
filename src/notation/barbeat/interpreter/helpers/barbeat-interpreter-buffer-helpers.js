import * as console from "#src/shared/v8-max-console.js";

/**
 * Clear pitch buffer and reset all pitch-related flags
 * @param {object} state - State object containing pitch buffer and flags
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
 * @param {object} state - State object
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
 * @param {object} state - State object
 * @param {Function} updateFn - Function that updates the state (receives state, returns void)
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
 * @param {object} state - State object
 * @param {Function} updateFn - Function that updates a single pitch state (receives pitchState, returns void)
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
