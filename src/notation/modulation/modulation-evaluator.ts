import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.js";
import { errorMessage } from "#src/shared/error-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import type { NoteEvent } from "../types.js";
import {
  evaluateModulationAST,
  type NoteContext,
  type NoteProperties,
  type ModulationResult,
} from "./modulation-evaluator-helpers.js";
import * as parser from "./parser/modulation-parser.js";

/**
 * Apply modulations to a list of notes in-place
 * @param notes - Notes to modulate
 * @param modulationString - Modulation expression string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function applyModulations(
  notes: NoteEvent[],
  modulationString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (!modulationString || notes.length === 0) {
    return;
  }

  // Parse the modulation string once before processing notes
  let ast;

  try {
    ast = parser.parse(modulationString);
  } catch (error) {
    console.error(
      `Warning: Failed to parse modulation string: ${errorMessage(error)}`,
    );

    return; // Early return - no point processing notes if parsing failed
  }

  // Calculate the overall clip timeRange in musical beats
  const firstNote = notes[0] as NoteEvent;
  const clipStartTime = firstNote.start_time * (timeSigDenominator / 4);
  const lastNote = notes.at(-1) as NoteEvent;
  const clipEndTime =
    (lastNote.start_time + lastNote.duration) * (timeSigDenominator / 4);

  for (const note of notes) {
    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipStartTime,
      clipEndTime,
    );

    const noteProperties = buildNoteProperties(note, timeSigDenominator);

    // Evaluate modulations for this note using the pre-parsed AST
    const modulations = evaluateModulationAST(ast, noteContext, noteProperties);

    // Apply modulations with operator semantics and range clamping
    applyVelocityModulation(note, modulations);
    applyTimingModulation(note, modulations);
    applyDurationModulation(note, modulations);
    applyProbabilityModulation(note, modulations);
  }
}

/**
 * Build note context object
 * @param note - Note event
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipStartTime - Clip start time
 * @param clipEndTime - Clip end time
 * @returns Note context for modulation evaluation
 */
function buildNoteContext(
  note: NoteEvent,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipStartTime: number,
  clipEndTime: number,
): NoteContext {
  // Convert note's Ableton beats start_time to musical beats position
  const musicalBeats = note.start_time * (timeSigDenominator / 4);

  // Parse bar|beat position for time range filtering
  const barBeatStr = abletonBeatsToBarBeat(
    note.start_time,
    timeSigNumerator,
    timeSigDenominator,
  );
  const barBeatMatch = barBeatStr.match(/^(\d+)\|(\d+(?:\.\d+)?)$/);
  const bar = barBeatMatch
    ? Number.parseInt(barBeatMatch[1] as string)
    : undefined;
  const beat = barBeatMatch
    ? Number.parseFloat(barBeatMatch[2] as string)
    : undefined;

  return {
    position: musicalBeats,
    pitch: note.pitch,
    bar,
    beat,
    timeSig: {
      numerator: timeSigNumerator,
      denominator: timeSigDenominator,
    },
    clipTimeRange: {
      start: clipStartTime,
      end: clipEndTime,
    },
  };
}

/**
 * Build note properties object
 * @param note - Note event
 * @param timeSigDenominator - Time signature denominator
 * @returns Note properties for variable access
 */
function buildNoteProperties(
  note: NoteEvent,
  timeSigDenominator: number,
): NoteProperties {
  return {
    pitch: note.pitch,
    start: note.start_time * (timeSigDenominator / 4),
    velocity: note.velocity,
    velocityDeviation: note.velocity_deviation ?? 0,
    duration: note.duration,
    probability: note.probability,
  };
}

/**
 * Apply velocity modulation to a note
 * @param note - Note to modify
 * @param modulations - Modulation results
 */
function applyVelocityModulation(
  note: NoteEvent,
  modulations: Record<string, ModulationResult>,
): void {
  if (modulations.velocity == null) {
    return;
  }

  if (modulations.velocity.operator === "set") {
    note.velocity = Math.max(1, Math.min(127, modulations.velocity.value));
  } else {
    // operator === "add"
    note.velocity = Math.max(
      1,
      Math.min(127, note.velocity + modulations.velocity.value),
    );
  }
}

/**
 * Apply timing modulation to a note
 * @param note - Note to modify
 * @param modulations - Modulation results
 */
function applyTimingModulation(
  note: NoteEvent,
  modulations: Record<string, ModulationResult>,
): void {
  if (modulations.timing == null) {
    return;
  }

  // Timing modulates start_time directly (in Ableton beats)
  if (modulations.timing.operator === "set") {
    note.start_time = modulations.timing.value;
  } else {
    // operator === "add"
    note.start_time += modulations.timing.value;
  }
}

/**
 * Apply duration modulation to a note
 * @param note - Note to modify
 * @param modulations - Modulation results
 */
function applyDurationModulation(
  note: NoteEvent,
  modulations: Record<string, ModulationResult>,
): void {
  if (modulations.duration == null) {
    return;
  }

  // operator is "set" or "add"
  note.duration =
    modulations.duration.operator === "set"
      ? Math.max(0.001, modulations.duration.value)
      : Math.max(0.001, note.duration + modulations.duration.value);
}

/**
 * Apply probability modulation to a note
 * @param note - Note to modify
 * @param modulations - Modulation results
 */
function applyProbabilityModulation(
  note: NoteEvent,
  modulations: Record<string, ModulationResult>,
): void {
  if (modulations.probability == null) {
    return;
  }

  if (modulations.probability.operator === "set") {
    note.probability = Math.max(
      0.0,
      Math.min(1.0, modulations.probability.value),
    );
  } else {
    // operator === "add"
    note.probability = Math.max(
      0.0,
      Math.min(1.0, (note.probability ?? 1.0) + modulations.probability.value),
    );
  }
}

/**
 * Evaluate a modulation expression for a specific note context
 * @param modulationString - Modulation expression string
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Modulation results keyed by parameter name
 */
export function evaluateModulation(
  modulationString: string,
  noteContext: NoteContext,
  noteProperties?: NoteProperties,
): Record<string, ModulationResult> {
  if (!modulationString) {
    return {};
  }

  let ast;

  try {
    ast = parser.parse(modulationString);
  } catch (error) {
    console.error(
      `Warning: Failed to parse modulation string: ${errorMessage(error)}`,
    );

    return {};
  }

  return evaluateModulationAST(ast, noteContext, noteProperties);
}
