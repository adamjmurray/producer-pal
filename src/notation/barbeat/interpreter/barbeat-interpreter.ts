// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { applyV0Deletions } from "#src/notation/barbeat/barbeat-apply-v0-deletions.ts";
import {
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "#src/notation/barbeat/barbeat-config.ts";
import * as parser from "#src/notation/barbeat/parser/barbeat-parser.ts";
import type { ASTElement } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import {
  barBeatDurationToMusicalBeats,
  parseBeatsPerBar,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type { NoteEvent, BarCopyNote } from "../../types.ts";
import {
  applyBarCopyResult,
  extractBufferState,
  handlePropertyUpdate,
  validateBufferedState,
  type InterpreterState,
  type PitchState,
} from "./helpers/barbeat-interpreter-buffer-helpers.ts";
import {
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
  handleClearBuffer,
  type BarCopyElement,
} from "./helpers/barbeat-interpreter-copy-helpers.ts";
import {
  calculatePositions,
  handlePitchEmission,
  type TimeElement,
} from "./helpers/barbeat-interpreter-pitch-helpers.ts";

interface InterpretOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
}

/**
 * Process a velocity update (single value)
 * @param element - AST element with velocity value
 * @param state - Interpreter state
 */
function processVelocityUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  state.currentVelocity = element.velocity ?? null;
  state.currentVelocityMin = null;
  state.currentVelocityMax = null;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = element.velocity as number;
    pitchState.velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  });
}

/**
 * Process a velocity range update
 * @param element - AST element with velocity range
 * @param state - Interpreter state
 */
function processVelocityRangeUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  state.currentVelocityMin = element.velocityMin ?? null;
  state.currentVelocityMax = element.velocityMax ?? null;
  state.currentVelocity = null;

  const velocityMin = element.velocityMin ?? 0;
  const velocityMax = element.velocityMax ?? 0;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = velocityMin;
    pitchState.velocityDeviation = velocityMax - velocityMin;
  });
}

/**
 * Process a duration update
 * @param element - AST element with duration value
 * @param state - Interpreter state
 * @param timeSigNumerator - Time signature numerator
 */
function processDurationUpdate(
  element: ASTElement,
  state: InterpreterState,
  timeSigNumerator: number | undefined,
): void {
  if (typeof element.duration === "string") {
    state.currentDuration = barBeatDurationToMusicalBeats(
      element.duration,
      timeSigNumerator,
    );
  } else {
    state.currentDuration = element.duration as number;
  }

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.duration = state.currentDuration;
  });
}

/**
 * Process a probability update
 * @param element - AST element with probability value
 * @param state - Interpreter state
 */
function processProbabilityUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  state.currentProbability = element.probability;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.probability = element.probability;
  });
}

/**
 * Process a pitch element
 * @param element - AST element with pitch value
 * @param state - Interpreter state
 */
function processPitchElement(
  element: ASTElement,
  state: InterpreterState,
): void {
  if (!state.pitchGroupStarted) {
    state.currentPitches = [];
    state.pitchGroupStarted = true;
    state.pitchesEmitted = false;
    state.stateChangedAfterEmission = false;
  }

  let velocity: number;
  let velocityDeviation: number;

  if (state.currentVelocityMin != null && state.currentVelocityMax != null) {
    velocity = state.currentVelocityMin;
    velocityDeviation = state.currentVelocityMax - state.currentVelocityMin;
  } else {
    velocity = state.currentVelocity ?? DEFAULT_VELOCITY;
    velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  }

  state.currentPitches.push({
    pitch: element.pitch as number,
    velocity: velocity,
    velocityDeviation: velocityDeviation,
    duration: state.currentDuration,
    probability: state.currentProbability,
  });
  state.stateChangedSinceLastPitch = false;
}

/**
 * Reset pitch buffer state
 * @param state - Interpreter state to reset
 */
function resetPitchBufferState(state: InterpreterState): void {
  state.currentPitches = [];
  state.pitchGroupStarted = false;
  state.pitchesEmitted = false;
  state.stateChangedSinceLastPitch = false;
  state.stateChangedAfterEmission = false;
}

/**
 * Process a time position element
 * @param element - AST element with time position
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 */
function processTimePosition(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  const positions = calculatePositions(
    element as TimeElement,
    state,
    beatsPerBar,
  );

  handlePitchEmission(
    positions,
    state,
    element as TimeElement,
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
 * Process a single element in the main AST loop.
 * Dispatches to appropriate handler based on element type.
 * @param element - AST element to process
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 */
function processElementInLoop(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigNumerator: number | undefined,
  timeSigDenominator: number | undefined,
  notesByBar: Map<number, BarCopyNote[]>,
  events: NoteEvent[],
): void {
  if (element.destination?.range !== undefined) {
    const result = handleBarCopyRangeDestination(
      element as BarCopyElement,
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
      element as BarCopyElement,
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
 * @param barBeatExpression - Bar|beat notation string
 * @param options - Interpretation options
 * @returns Array of note events
 */
export function interpretNotation(
  barBeatExpression: string,
  options: InterpretOptions = {},
): NoteEvent[] {
  if (!barBeatExpression) {
    return [];
  }

  const { timeSigNumerator, timeSigDenominator } = options;
  const beatsPerBar = parseBeatsPerBar(options);

  try {
    const ast = parser.parse(barBeatExpression);
    // Bar copy tracking: Map bar number -> array of note metadata
    const notesByBar = new Map<number, BarCopyNote[]>();
    const events: NoteEvent[] = [];

    // Create state object for easier passing to helper functions
    const state: InterpreterState = {
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
      console.warn(
        `${state.currentPitches.length} pitch(es) buffered but no time position to emit them`,
      );
    }

    // Apply v0 deletions as final post-processing step
    return applyV0Deletions(events);
  } catch (error) {
    if (error instanceof Error && error.name === "SyntaxError") {
      const parserError = error as Error & {
        location?: { start?: { offset: number; line: number; column: number } };
      };
      const location = parserError.location ?? {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      throw new Error(`bar|beat syntax error ${position}: ${error.message}`);
    }

    throw error;
  }
}
