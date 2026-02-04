import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type { NoteEvent } from "../types.ts";
import * as parser from "./parser/transform-parser.ts";
import {
  evaluateTransformAST,
  type NoteContext,
  type NoteProperties,
  type TransformResult,
} from "./transform-evaluator-helpers.ts";

/**
 * Apply transforms to a list of notes in-place
 * @param notes - Notes to transform
 * @param transformString - Transform expression string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
export function applyTransforms(
  notes: NoteEvent[],
  transformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (!transformString || notes.length === 0) {
    return;
  }

  // Parse the transform string once before processing notes
  let ast;

  try {
    ast = parser.parse(transformString);
  } catch (error) {
    console.warn(`Failed to parse transform string: ${errorMessage(error)}`);

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

    // Evaluate transforms for this note using the pre-parsed AST
    const transforms = evaluateTransformAST(ast, noteContext, noteProperties);

    // Apply transforms with operator semantics and range clamping
    applyVelocityTransform(note, transforms);
    applyTimingTransform(note, transforms);
    applyDurationTransform(note, transforms);
    applyProbabilityTransform(note, transforms);
    applyDeviationTransform(note, transforms);
    applyPitchTransform(note, transforms);
  }
}

/**
 * Build note context object
 * @param note - Note event
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipStartTime - Clip start time
 * @param clipEndTime - Clip end time
 * @returns Note context for transform evaluation
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
    deviation: note.velocity_deviation ?? 0,
    duration: note.duration,
    probability: note.probability,
  };
}

/**
 * Apply velocity transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyVelocityTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.velocity == null) {
    return;
  }

  if (transforms.velocity.operator === "set") {
    note.velocity = Math.max(1, Math.min(127, transforms.velocity.value));
  } else {
    // operator === "add"
    note.velocity = Math.max(
      1,
      Math.min(127, note.velocity + transforms.velocity.value),
    );
  }
}

/**
 * Apply timing transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyTimingTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.timing == null) {
    return;
  }

  // Timing transforms start_time directly (in Ableton beats)
  if (transforms.timing.operator === "set") {
    note.start_time = transforms.timing.value;
  } else {
    // operator === "add"
    note.start_time += transforms.timing.value;
  }
}

/**
 * Apply duration transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyDurationTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.duration == null) {
    return;
  }

  // operator is "set" or "add"
  note.duration =
    transforms.duration.operator === "set"
      ? Math.max(0.001, transforms.duration.value)
      : Math.max(0.001, note.duration + transforms.duration.value);
}

/**
 * Apply probability transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyProbabilityTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.probability == null) {
    return;
  }

  if (transforms.probability.operator === "set") {
    note.probability = Math.max(
      0.0,
      Math.min(1.0, transforms.probability.value),
    );
  } else {
    // operator === "add"
    note.probability = Math.max(
      0.0,
      Math.min(1.0, (note.probability ?? 1.0) + transforms.probability.value),
    );
  }
}

/**
 * Apply deviation transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyDeviationTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.deviation == null) {
    return;
  }

  if (transforms.deviation.operator === "set") {
    note.velocity_deviation = Math.max(
      -127,
      Math.min(127, transforms.deviation.value),
    );
  } else {
    // operator === "add"
    note.velocity_deviation = Math.max(
      -127,
      Math.min(
        127,
        (note.velocity_deviation ?? 0) + transforms.deviation.value,
      ),
    );
  }
}

/**
 * Apply pitch transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyPitchTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.pitch == null) {
    return;
  }

  const newPitch =
    transforms.pitch.operator === "set"
      ? transforms.pitch.value
      : note.pitch + transforms.pitch.value;

  // Round to integer (MIDI pitch must be integer) then clamp to 0-127
  note.pitch = Math.max(0, Math.min(127, Math.round(newPitch)));
}

/**
 * Evaluate a transform expression for a specific note context
 * @param transformString - Transform expression string
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Transform results keyed by parameter name
 */
export function evaluateTransform(
  transformString: string,
  noteContext: NoteContext,
  noteProperties?: NoteProperties,
): Record<string, TransformResult> {
  if (!transformString) {
    return {};
  }

  let ast;

  try {
    ast = parser.parse(transformString);
  } catch (error) {
    console.warn(`Failed to parse transform string: ${errorMessage(error)}`);

    return {};
  }

  return evaluateTransformAST(ast, noteContext, noteProperties);
}
