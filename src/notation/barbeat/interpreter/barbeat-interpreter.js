import { applyV0Deletions } from "#src/notation/barbeat/barbeat-apply-v0-deletions.js";
import {
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "#src/notation/barbeat/barbeat-config.js";
import * as parser from "#src/notation/barbeat/parser/barbeat-parser.js";
import {
  barBeatDurationToMusicalBeats,
  parseBeatsPerBar,
} from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  applyBarCopyResult,
  extractBufferState,
  handlePropertyUpdate,
  validateBufferedState,
} from "./helpers/barbeat-interpreter-buffer-helpers.js";
import {
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
  handleClearBuffer,
} from "./helpers/barbeat-interpreter-copy-helpers.js";
import {
  calculatePositions,
  handlePitchEmission,
} from "./helpers/barbeat-interpreter-pitch-helpers.js";

/**
 * @typedef {import('./helpers/barbeat-interpreter-buffer-helpers.js').InterpreterState} InterpreterState
 * @typedef {import('./helpers/barbeat-interpreter-buffer-helpers.js').PitchState} PitchState
 * @typedef {import('./helpers/barbeat-interpreter-copy-helpers.js').NoteEvent} NoteEvent
 * @typedef {import('./helpers/barbeat-interpreter-copy-helpers.js').BarCopyNote} BarCopyNote
 * @typedef {import('./helpers/barbeat-interpreter-pitch-helpers.js').TimeElement} TimeElement
 */

/**
 * @typedef {object} ASTElement
 * @property {number} [velocity] - Velocity value
 * @property {number} [velocityMin] - Velocity range minimum
 * @property {number} [velocityMax] - Velocity range maximum
 * @property {number | string} [duration] - Duration value or bar:beat string
 * @property {number} [probability] - Probability value
 * @property {number} [pitch] - MIDI pitch
 * @property {number | null} [bar] - Bar number
 * @property {number | object} [beat] - Beat number or repeat pattern
 * @property {boolean} [clearBuffer] - Whether to clear buffer
 * @property {{ bar?: number, range?: [number, number] }} [destination] - Bar copy destination
 * @property {{ bar?: number, range?: [number, number] } | 'previous'} [source] - Bar copy source
 */

/**
 * Process a velocity update (single value)
 * @param {ASTElement} element - AST element with velocity property
 * @param {InterpreterState} state - Interpreter state object
 */
function processVelocityUpdate(element, state) {
  state.currentVelocity = element.velocity ?? null;
  state.currentVelocityMin = null;
  state.currentVelocityMax = null;

  handlePropertyUpdate(state, (/** @type {PitchState} */ pitchState) => {
    pitchState.velocity = /** @type {number} */ (element.velocity);
    pitchState.velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  });
}

/**
 * Process a velocity range update
 * @param {ASTElement} element - AST element with velocityMin/Max properties
 * @param {InterpreterState} state - Interpreter state object
 */
function processVelocityRangeUpdate(element, state) {
  state.currentVelocityMin = element.velocityMin ?? null;
  state.currentVelocityMax = element.velocityMax ?? null;
  state.currentVelocity = null;

  const velocityMin = element.velocityMin ?? 0;
  const velocityMax = element.velocityMax ?? 0;

  handlePropertyUpdate(state, (/** @type {PitchState} */ pitchState) => {
    pitchState.velocity = velocityMin;
    pitchState.velocityDeviation = velocityMax - velocityMin;
  });
}

/**
 * Process a duration update
 * @param {ASTElement} element - AST element with duration property
 * @param {InterpreterState} state - Interpreter state object
 * @param {number | undefined} timeSigNumerator - Time signature numerator
 */
function processDurationUpdate(element, state, timeSigNumerator) {
  if (typeof element.duration === "string") {
    state.currentDuration = barBeatDurationToMusicalBeats(
      element.duration,
      timeSigNumerator,
    );
  } else {
    state.currentDuration = /** @type {number} */ (element.duration);
  }

  handlePropertyUpdate(state, (/** @type {PitchState} */ pitchState) => {
    pitchState.duration = state.currentDuration;
  });
}

/**
 * Process a probability update
 * @param {ASTElement} element - AST element with probability property
 * @param {InterpreterState} state - Interpreter state object
 */
function processProbabilityUpdate(element, state) {
  state.currentProbability = element.probability;

  handlePropertyUpdate(state, (/** @type {PitchState} */ pitchState) => {
    pitchState.probability = element.probability;
  });
}

/**
 * Process a pitch element
 * @param {ASTElement} element - AST element with pitch property
 * @param {InterpreterState} state - Interpreter state object
 */
function processPitchElement(element, state) {
  if (!state.pitchGroupStarted) {
    state.currentPitches = [];
    state.pitchGroupStarted = true;
    state.pitchesEmitted = false;
    state.stateChangedAfterEmission = false;
  }

  let velocity, velocityDeviation;

  if (state.currentVelocityMin != null && state.currentVelocityMax != null) {
    velocity = state.currentVelocityMin;
    velocityDeviation = state.currentVelocityMax - state.currentVelocityMin;
  } else {
    velocity = state.currentVelocity ?? DEFAULT_VELOCITY;
    velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  }

  state.currentPitches.push({
    pitch: /** @type {number} */ (element.pitch),
    velocity: velocity,
    velocityDeviation: velocityDeviation,
    duration: state.currentDuration,
    probability: state.currentProbability,
  });
  state.stateChangedSinceLastPitch = false;
}

/**
 * Reset pitch buffer state
 * @param {InterpreterState} state - Interpreter state object
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
 * @param {ASTElement} element - AST element with bar/beat properties
 * @param {InterpreterState} state - Interpreter state object
 * @param {number} beatsPerBar - Beats per bar
 * @param {number | undefined} timeSigDenominator - Time signature denominator
 * @param {Array<NoteEvent>} events - Array of note events
 * @param {Map<number, Array<BarCopyNote>>} notesByBar - Map of bar numbers to note metadata
 */
function processTimePosition(
  element,
  state,
  beatsPerBar,
  timeSigDenominator,
  events,
  notesByBar,
) {
  const positions = calculatePositions(
    /** @type {TimeElement} */ (element),
    state,
    beatsPerBar,
  );

  handlePitchEmission(
    positions,
    state,
    /** @type {TimeElement} */ (element),
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
 * @param {ASTElement} element - AST element to process
 * @param {InterpreterState} state - Interpreter state object
 * @param {number} beatsPerBar - Beats per bar
 * @param {number | undefined} timeSigNumerator - Time signature numerator
 * @param {number | undefined} timeSigDenominator - Time signature denominator
 * @param {Map<number, Array<BarCopyNote>>} notesByBar - Map of bar numbers to note metadata
 * @param {Array<NoteEvent>} events - Array of note events
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
      /** @type {import('./helpers/barbeat-interpreter-copy-helpers.js').BarCopyElement} */ (
        element
      ),
      beatsPerBar,
      timeSigDenominator,
      notesByBar,
      events,
      extractBufferState(state),
    );

    applyBarCopyResult(state, result);
    resetPitchBufferState(state);
  } else if (element.destination?.bar !== undefined) {
    const result = handleBarCopySingleDestination(
      /** @type {import('./helpers/barbeat-interpreter-copy-helpers.js').BarCopyElement} */ (
        element
      ),
      beatsPerBar,
      timeSigDenominator,
      notesByBar,
      events,
      extractBufferState(state),
    );

    applyBarCopyResult(state, result);
    resetPitchBufferState(state);
  } else if (element.clearBuffer) {
    validateBufferedState(extractBufferState(state), "@clear");
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
    processDurationUpdate(element, state, timeSigNumerator);
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
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>} - Array of note events
 */
export function interpretNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) {
    return [];
  }

  const { timeSigNumerator, timeSigDenominator } = options;
  const beatsPerBar = parseBeatsPerBar(options);

  try {
    const ast = parser.parse(barBeatExpression);
    // Bar copy tracking: Map bar number -> array of note metadata
    /** @type {Map<number, Array<BarCopyNote>>} */
    const notesByBar = new Map();
    /** @type {Array<NoteEvent>} */
    const events = [];

    // Create state object for easier passing to helper functions
    /** @type {InterpreterState} */
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
    if (error instanceof Error && error.name === "SyntaxError") {
      const parserError =
        /** @type {{ location?: { start?: { offset: number, line: number, column: number } } }} */ (
          /** @type {unknown} */ (error)
        );
      const location = parserError.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      throw new Error(`bar|beat syntax error ${position}: ${error.message}`);
    }

    throw error;
  }
}
