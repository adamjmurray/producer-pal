import * as console from "../../shared/v8-max-console";
import { applyV0Deletions } from "./barbeat-apply-v0-deletions.js";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config.js";
import {
  validateBufferedState,
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
  handleClearBuffer,
} from "./barbeat-interpreter-helpers.js";
import {
  calculatePositions,
  handlePitchEmission,
} from "./barbeat-interpreter-pitch-helpers.js";
import * as parser from "./barbeat-parser.js";
import { barBeatDurationToMusicalBeats } from "./barbeat-time.js";

/**
 * Process a velocity update (single value)
 * @param {object} element - AST element with velocity property
 * @param {object} state - Interpreter state object
 */
function processVelocityUpdate(element, state) {
  state.currentVelocity = element.velocity;
  state.currentVelocityMin = null;
  state.currentVelocityMax = null;
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      pitchState.velocity = element.velocity;
      pitchState.velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
    }
    state.stateChangedAfterEmission = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
  }
}

/**
 * Process a velocity range update
 * @param {object} element - AST element with velocityMin/Max properties
 * @param {object} state - Interpreter state object
 */
function processVelocityRangeUpdate(element, state) {
  state.currentVelocityMin = element.velocityMin;
  state.currentVelocityMax = element.velocityMax;
  state.currentVelocity = null;
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      pitchState.velocity = element.velocityMin;
      pitchState.velocityDeviation = element.velocityMax - element.velocityMin;
    }
    state.stateChangedAfterEmission = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
  }
}

/**
 * Process a duration update
 * @param {object} element - AST element with duration property
 * @param {object} state - Interpreter state object
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 */
function processDurationUpdate(
  element,
  state,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (typeof element.duration === "string") {
    state.currentDuration = barBeatDurationToMusicalBeats(
      element.duration,
      timeSigNumerator,
      timeSigDenominator,
    );
  } else {
    state.currentDuration = element.duration;
  }
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      pitchState.duration = state.currentDuration;
    }
    state.stateChangedAfterEmission = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
  }
}
/**
 * Process a probability update
 * @param {object} element - AST element with probability property
 * @param {object} state - Interpreter state object
 */
function processProbabilityUpdate(element, state) {
  state.currentProbability = element.probability;
  if (state.pitchGroupStarted && state.currentPitches.length > 0) {
    state.stateChangedSinceLastPitch = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length > 0) {
    for (const pitchState of state.currentPitches) {
      pitchState.probability = element.probability;
    }
    state.stateChangedAfterEmission = true;
  }
  if (!state.pitchGroupStarted && state.currentPitches.length === 0) {
    state.stateChangedAfterEmission = true;
  }
}
/**
 * Process a pitch element
 * @param {object} element - AST element with pitch property
 * @param {object} state - Interpreter state object
 */
function processPitchElement(element, state) {
  if (!state.pitchGroupStarted) {
    state.currentPitches = [];
    state.pitchGroupStarted = true;
    state.pitchesEmitted = false;
    state.stateChangedAfterEmission = false;
  }
  let velocity, velocityDeviation;
  if (state.currentVelocityMin !== null && state.currentVelocityMax !== null) {
    velocity = state.currentVelocityMin;
    velocityDeviation = state.currentVelocityMax - state.currentVelocityMin;
  } else {
    velocity = state.currentVelocity ?? DEFAULT_VELOCITY;
    velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  }
  state.currentPitches.push({
    pitch: element.pitch,
    velocity: velocity,
    velocityDeviation: velocityDeviation,
    duration: state.currentDuration,
    probability: state.currentProbability,
  });
  state.stateChangedSinceLastPitch = false;
}
/**
 * Reset pitch buffer state
 * @param {object} state - Interpreter state object
 */
function resetPitchBufferState(state) {
  state.currentPitches = [];
  state.pitchGroupStarted = false;
  state.pitchesEmitted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
}

/**
 * Process a time position element
 * @param {object} element - AST element with bar/beat properties
 * @param {object} state - Interpreter state object
 * @param {number} beatsPerBar - Beats per bar
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {Array} events - Array of note events
 * @param {Map} notesByBar - Map of bar numbers to note metadata
 */
function processTimePosition(
  element,
  state,
  beatsPerBar,
  timeSigDenominator,
  events,
  notesByBar,
) {
  const positions = calculatePositions(element, state, beatsPerBar);

  handlePitchEmission(
    positions,
    state,
    element,
    beatsPerBar,
    timeSigDenominator,
    events,
    notesByBar,
  );

  state.pitchGroupStarted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
}

/**
 * Process a single element in the main AST loop
 * Dispatches to appropriate handler based on element type
 * @param {object} element - AST element to process
 * @param {object} state - Interpreter state object
 * @param {number} beatsPerBar - Beats per bar
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {Map} notesByBar - Map of bar numbers to note metadata
 * @param {Array} events - Array of note events
 */
function processElementInLoop(
  element,
  state,
  beatsPerBar,
  timeSigNumerator,
  timeSigDenominator,
  notesByBar,
  events,
) {
  if (element.destination?.range !== undefined) {
    const result = handleBarCopyRangeDestination(
      element,
      beatsPerBar,
      timeSigDenominator,
      notesByBar,
      events,
      {
        currentPitches: state.currentPitches,
        pitchesEmitted: state.pitchesEmitted,
        stateChangedSinceLastPitch: state.stateChangedSinceLastPitch,
        pitchGroupStarted: state.pitchGroupStarted,
        stateChangedAfterEmission: state.stateChangedAfterEmission,
      },
    );
    if (result.currentTime) {
      state.currentTime = result.currentTime;
      state.hasExplicitBarNumber = result.hasExplicitBarNumber;
    }
    resetPitchBufferState(state);
  } else if (element.destination?.bar !== undefined) {
    const result = handleBarCopySingleDestination(
      element,
      beatsPerBar,
      timeSigDenominator,
      notesByBar,
      events,
      {
        currentPitches: state.currentPitches,
        pitchesEmitted: state.pitchesEmitted,
        stateChangedSinceLastPitch: state.stateChangedSinceLastPitch,
        pitchGroupStarted: state.pitchGroupStarted,
        stateChangedAfterEmission: state.stateChangedAfterEmission,
      },
    );
    if (result.currentTime) {
      state.currentTime = result.currentTime;
      state.hasExplicitBarNumber = result.hasExplicitBarNumber;
    }
    resetPitchBufferState(state);
  } else if (element.clearBuffer) {
    validateBufferedState(
      {
        currentPitches: state.currentPitches,
        pitchesEmitted: state.pitchesEmitted,
        stateChangedSinceLastPitch: state.stateChangedSinceLastPitch,
        pitchGroupStarted: state.pitchGroupStarted,
        stateChangedAfterEmission: state.stateChangedAfterEmission,
      },
      "@clear",
    );
    handleClearBuffer(notesByBar);
    resetPitchBufferState(state);
  } else if (element.bar !== undefined && element.beat !== undefined) {
    processTimePosition(
      element,
      state,
      beatsPerBar,
      timeSigDenominator,
      events,
      notesByBar,
    );
  } else if (element.pitch !== undefined) {
    processPitchElement(element, state);
  } else if (element.velocity !== undefined) {
    processVelocityUpdate(element, state);
  } else if (
    element.velocityMin !== undefined &&
    element.velocityMax !== undefined
  ) {
    processVelocityRangeUpdate(element, state);
  } else if (element.duration !== undefined) {
    processDurationUpdate(element, state, timeSigNumerator, timeSigDenominator);
  } else if (element.probability !== undefined) {
    processProbabilityUpdate(element, state);
  }
}

/**
 * Convert bar|beat notation into note events
 * @param {string} barBeatExpression - bar|beat notation string
 * @param {object} options - Options
 * @param {number} [options.beatsPerBar] - beats per bar (legacy, prefer timeSigNumerator/timeSigDenominator)
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {number} [options.timeSigDenominator] - Time signature denominator
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function interpretNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) {
    return [];
  }
  const {
    beatsPerBar: beatsPerBarOption,
    timeSigNumerator,
    timeSigDenominator,
  } = options;
  if (
    (timeSigNumerator != null && timeSigDenominator == null) ||
    (timeSigDenominator != null && timeSigNumerator == null)
  ) {
    throw new Error(
      "Time signature must be specified with both numerator and denominator",
    );
  }
  const beatsPerBar =
    timeSigNumerator ?? beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR;
  try {
    const ast = parser.parse(barBeatExpression);
    // Bar copy tracking: Map bar number -> array of note metadata
    const notesByBar = new Map();
    const events = [];
    // Create state object for easier passing to helper functions
    const state = {
      currentTime: DEFAULT_TIME,
      currentVelocity: DEFAULT_VELOCITY,
      currentDuration: DEFAULT_DURATION,
      currentProbability: DEFAULT_PROBABILITY,
      currentVelocityMin: null,
      currentVelocityMax: null,
      hasExplicitBarNumber: false,
      currentPitches: [],
      pitchGroupStarted: false,
      pitchesEmitted: false,
      stateChangedSinceLastPitch: false,
      stateChangedAfterEmission: false,
    };
    for (const element of ast) {
      processElementInLoop(
        element,
        state,
        beatsPerBar,
        timeSigNumerator,
        timeSigDenominator,
        notesByBar,
        events,
      );
    }
    // Warn if pitches buffered but never emitted
    if (state.currentPitches.length > 0 && !state.pitchesEmitted) {
      console.error(
        `Warning: ${state.currentPitches.length} pitch(es) buffered but no time position to emit them`,
      );
    }
    // Apply v0 deletions as final post-processing step
    return applyV0Deletions(events);
  } catch (error) {
    if (error.name === "SyntaxError") {
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";
      throw new Error(`bar|beat syntax error ${position}: ${error.message}`);
    }
    throw error;
  }
}
