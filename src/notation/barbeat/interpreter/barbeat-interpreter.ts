// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { applyV0Deletions } from "#src/notation/barbeat/barbeat-apply-v0-deletions.ts";
import {
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  defaultDurationMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import * as parser from "#src/notation/barbeat/parser/barbeat-parser.ts";
import {
  type ASTElement,
  type PatternStream,
  type StreamPitch,
} from "#src/notation/barbeat/parser/barbeat-parser.ts";
import { parseBeatsPerBar } from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent, type BarCopyNote } from "../../types.ts";
import {
  countBufferedPitches,
  extractBufferState,
  validateBufferedState,
  type InterpreterState,
} from "./helpers/barbeat-interpreter-buffer-helpers.ts";
import {
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
  handleClearBuffer,
  type BarCopyElement,
} from "./helpers/barbeat-interpreter-copy-helpers.ts";
import {
  buildPitchState,
  calculatePositions,
  handlePitchEmission,
  type TimeElement,
} from "./helpers/barbeat-interpreter-pitch-helpers.ts";
import {
  processDurationUpdate,
  processProbabilityUpdate,
  processVelocityRangeUpdate,
  processVelocityUpdate,
} from "./helpers/barbeat-interpreter-property-helpers.ts";
import { acceptPitch } from "./helpers/barbeat-interpreter-range-helpers.ts";
import {
  buildDurationStream,
  buildProbabilityStream,
  buildVelocityStream,
} from "./helpers/barbeat-interpreter-stream-helpers.ts";

interface InterpretOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
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
    // A bare pitch reassigns the pitch parameter to a length-1 stream, so it
    // replaces any active pattern bracket and rewinds the cursor.
    state.currentPitchStream = null;
    state.pitchStreamCursor = 0;
    state.pitchGroupStarted = true;
    state.pitchesEmitted = false;
    state.stateChangedAfterEmission = false;
  }

  // Out-of-range pitch is skipped (other pitches in the same chord/group still
  // emit); range no longer aborts the parse.
  if (!acceptPitch(element.pitch as number)) {
    return;
  }

  state.currentPitches.push(buildPitchState(element.pitch as number, state));
  state.stateChangedSinceLastPitch = false;
}

/**
 * Process a pattern bracket (`[...]`), dispatching on its parameter kind. A
 * pitch stream feeds the pitch buffer; a velocity/duration/probability stream
 * becomes an active value stream that OVERRIDES the captured per-pitch value at
 * emission, cycled by its own cursor. Each stream rewinds its cursor (a new
 * bracket reassigns the parameter) and persists across separate time positions
 * until reassigned. With `@step` omitted, a duration stream also folds its
 * cycled values into the position spacing (the duration-fold; see
 * `expandRepeatPattern`).
 * @param element - AST element carrying a stream
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar (for duration-stream bar components)
 * @param timeSigDenominator - Time signature denominator (for duration units)
 */
function processStreamElement(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): void {
  // stream is always defined here (checked at the dispatch); the cast documents
  // that guarantee, matching the element.pitch/element.velocity pattern.
  const stream = element.stream as PatternStream;

  switch (stream.param) {
    case "pitch":
      processPitchStreamElement(stream.values, state);
      break;
    case "velocity":
      state.currentVelocityStream = buildVelocityStream(stream.values);
      state.velocityStreamCursor = 0;
      break;
    case "duration":
      state.currentDurationStream = buildDurationStream(
        stream.values,
        beatsPerBar,
        timeSigDenominator,
      );
      state.durationStreamCursor = 0;
      break;
    case "probability":
      state.currentProbabilityStream = buildProbabilityStream(stream.values);
      state.probabilityStreamCursor = 0;
      break;
  }
}

/**
 * Build the pitch buffer from a pitch stream's chords. Starts a pitch group
 * (mirror processPitchElement) so the post-stream "state change won't affect
 * this group" warning still fires, captures the current velocity/duration/
 * probability into each chord, and rewinds the cursor. Out-of-range pitches are
 * dropped per chord (matching plain pitches).
 * @param values - Pitch stream chords (each a list of pitches)
 * @param state - Interpreter state
 */
function processPitchStreamElement(
  values: StreamPitch[][],
  state: InterpreterState,
): void {
  if (!state.pitchGroupStarted) {
    state.currentPitches = [];
    state.pitchGroupStarted = true;
    state.pitchesEmitted = false;
    state.stateChangedAfterEmission = false;
  }

  state.currentPitchStream = values.map((chord) =>
    chord
      .filter((value) => acceptPitch(value.pitch))
      .map((value) => buildPitchState(value.pitch, state)),
  );
  // A new bracket reassigns the pitch parameter, so its cursor starts fresh.
  state.pitchStreamCursor = 0;
  state.stateChangedSinceLastPitch = false;
}

/**
 * Reset pitch buffer state
 * @param state - Interpreter state to reset
 */
function resetPitchBufferState(state: InterpreterState): void {
  state.currentPitches = [];
  state.currentPitchStream = null;
  state.pitchStreamCursor = 0;
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

  // The pitch stream PERSISTS across time positions (cross-event cursor):
  // handlePitchEmission already advanced state.pitchStreamCursor by the number
  // of emitted events, so the next position picks up where this one left off.
  // The group flags reset (a following pitch token starts a fresh group and
  // reassigns the stream); the stream itself clears only on reassignment.
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
  } else if (element.stream !== undefined) {
    processStreamElement(element, state, beatsPerBar, timeSigDenominator);
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
      currentPitchStream: null,
      pitchStreamCursor: 0,
      currentVelocityStream: null,
      velocityStreamCursor: 0,
      currentDurationStream: null,
      durationStreamCursor: 0,
      currentProbabilityStream: null,
      probabilityStreamCursor: 0,
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

    // Warn if pitches buffered but never emitted (includes a dangling pattern
    // bracket as a new species of un-emitted pitch state).
    const buffered = countBufferedPitches(state);

    if (buffered > 0 && !state.pitchesEmitted) {
      console.warn(
        `${buffered} pitch(es) buffered but no time position to emit them`,
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
