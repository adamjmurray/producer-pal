// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { applyV0Deletions } from "#src/notation/barbeat/barbeat-apply-v0-deletions.ts";
import {
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
  defaultDurationMusicalBeats,
  wholeNoteFractionToMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import * as parser from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { type ASTElement } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { parseBeatsPerBar } from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent, type BarCopyNote } from "../../types.ts";
import {
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
import {
  acceptPitch,
  clampProbability,
  clampVelocity,
} from "./helpers/barbeat-interpreter-range-helpers.ts";

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
  const velocity = clampVelocity(element.velocity as number, "velocity");

  state.currentVelocity = velocity;
  state.currentVelocityMin = null;
  state.currentVelocityMax = null;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = velocity;
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
  const velocityMin = clampVelocity(
    element.velocityMin ?? 0,
    "velocity range min",
  );
  const velocityMax = clampVelocity(
    element.velocityMax ?? 0,
    "velocity range max",
  );

  state.currentVelocityMin = velocityMin;
  state.currentVelocityMax = velocityMax;
  state.currentVelocity = null;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = velocityMin;
    pitchState.velocityDeviation = velocityMax - velocityMin;
  });
}

/**
 * Process a duration update.
 * The grammar emits the sub-bar part as a fraction of a whole note (e.g., 1/4
 * for a quarter) and an optional meter-aware `bars` count (`1bar`, `1bar+n3/4`).
 * Convert both to musical beats: the fraction scales by the time-signature
 * denominator, the bars by beatsPerBar.
 * @param element - AST element with duration value
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar (musical beats; for the bar component)
 * @param timeSigDenominator - Time signature denominator
 */
function processDurationUpdate(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): void {
  const fractionBeats = wholeNoteFractionToMusicalBeats(
    element.duration ?? 0,
    timeSigDenominator,
  );
  const barBeats = (element.bars ?? 0) * beatsPerBar;

  state.currentDuration = barBeats + fractionBeats;

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
  const probability = clampProbability(element.probability as number);

  state.currentProbability = probability;

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.probability = probability;
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

  // Out-of-range pitch is skipped (other pitches in the same chord/group still
  // emit); range no longer aborts the parse.
  if (!acceptPitch(element.pitch as number)) {
    return;
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
    timeSigDenominator,
  );

  handlePitchEmission(
    positions,
    state,
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
 * @param timeSigDenominator - Time signature denominator
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 */
function processElementInLoop(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
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

    if (result.currentTime) {
      state.currentTime = result.currentTime;
    }

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

    if (result.currentTime) {
      state.currentTime = result.currentTime;
    }

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
    processDurationUpdate(element, state, beatsPerBar, timeSigDenominator);
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

  const { timeSigDenominator } = options;
  const beatsPerBar = parseBeatsPerBar(options);

  try {
    // Pass the denominator so the grammar can resolve `±n` beat offsets
    // (whole-note fractions) into musical beats during the parse, and
    // beatsPerBar so it can borrow across a bar line when a `-n` offset pulls a
    // position earlier than beat 1 (e.g. `2|1-n/12`).
    const ast = parser.parse(barBeatExpression, {
      timeSigDenominator,
      beatsPerBar,
    });
    // Bar copy tracking: Map bar number -> array of note metadata
    const notesByBar = new Map<number, BarCopyNote[]>();
    const events: NoteEvent[] = [];

    // Create state object for easier passing to helper functions
    const state: InterpreterState = {
      currentTime: DEFAULT_TIME,
      currentVelocity: DEFAULT_VELOCITY,
      currentDuration: defaultDurationMusicalBeats(timeSigDenominator),
      currentProbability: DEFAULT_PROBABILITY,
      currentVelocityMin: null,
      currentVelocityMax: null,
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
      const formatted = formatParserError(
        error as PeggySyntaxError,
        "bar|beat",
      );

      throw new Error(formatted, { cause: error });
    }

    throw error;
  }
}
