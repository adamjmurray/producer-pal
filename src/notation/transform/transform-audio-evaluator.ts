// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { wholeNoteFractionToMusicalBeats } from "#src/notation/barbeat/barbeat-config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  type ClipContext,
  isNoteOp,
  type NoteProperties,
  operatorDisplay,
} from "./helpers/transform-evaluator-helpers.ts";
import {
  type ExpressionNode,
  type TransformAssignment,
  type TransformStatement,
} from "./parser/transform-parser.ts";
import * as parser from "./parser/transform-parser.ts";
import { evaluateFunction } from "./transform-functions.ts";

// Constants for gain clamping
const MIN_GAIN_DB = -70;
const MAX_GAIN_DB = 24;

// Constants for pitch shift clamping
const MIN_PITCH_SHIFT = -48;
const MAX_PITCH_SHIFT = 48;

// MIDI-only parameters that should be skipped for audio clips
const MIDI_PARAMETERS = new Set([
  "velocity",
  "timing",
  "duration",
  "probability",
  "deviation",
  "pitch",
]);

export interface AudioProperties {
  gain: number;
  pitchShift: number;
}

export interface AudioTransformResult {
  gain: number | null;
  pitchShift: number | null;
}

/**
 * Apply audio transforms to a clip (gain and/or pitchShift)
 * @param currentGainDb - Current gain in dB
 * @param currentPitchShift - Current pitch shift in semitones
 * @param transformString - Transform expression string
 * @param clipContext - Optional clip-level context for clip/bar variables
 * @returns Object with new gain and pitchShift values, or null for unchanged
 */
export function applyAudioTransform(
  currentGainDb: number,
  currentPitchShift: number,
  transformString: string | undefined,
  clipContext?: ClipContext,
): AudioTransformResult {
  if (!transformString) {
    return { gain: null, pitchShift: null };
  }

  let ast: TransformStatement[];

  try {
    // Audio transforms operate on whole-clip gain/pitchShift and never apply a
    // timeRange, so the meter is irrelevant here; pass denominator 4 to satisfy
    // the now meter-aware grammar (matches this evaluator's hardcoded-4 convention).
    ast = parser.parse(transformString, { timeSigDenominator: 4 });
  } catch (error) {
    console.warn(`Failed to parse transform string: ${errorMessage(error)}`);

    return { gain: null, pitchShift: null };
  }

  warnIncompatibleAudioSelectors(ast);

  // Filter to audio-only assignments (gain and pitchShift)
  const audioAssignments = ast.filter(
    (a): a is TransformAssignment =>
      !isNoteOp(a) && (a.parameter === "gain" || a.parameter === "pitchShift"),
  );

  if (audioAssignments.length === 0) {
    return { gain: null, pitchShift: null };
  }

  // Build audio properties for variable access
  const audioProperties: AudioProperties = {
    gain: currentGainDb,
    pitchShift: currentPitchShift,
  };

  let newGainDb = currentGainDb;
  let newPitchShift = currentPitchShift;
  let gainModified = false;
  let pitchShiftModified = false;

  for (const assignment of audioAssignments) {
    // A duplicate selector segment is warned-and-skipped, consistent with the
    // MIDI evaluator: relay the parser's message and skip just this line.
    if (assignment.selectorWarning != null) {
      console.warn(assignment.selectorWarning);
      continue;
    }

    // A bare top-level pitch literal (`gain = C3`) is nonsensical for audio and
    // is warned-and-skipped here (a nested pitch literal is still resolved to
    // its MIDI number in evaluateAudioExpression).
    if (warnAndSkipBarePitchLiteral(assignment)) continue;

    try {
      const value = evaluateAudioExpression(
        assignment.expression,
        audioProperties,
        clipContext,
      );

      if (assignment.parameter === "gain") {
        newGainDb = nextAudioValue(assignment.operator, newGainDb, value);
        audioProperties.gain = newGainDb;
        gainModified = true;
      } else if (assignment.parameter === "pitchShift") {
        newPitchShift = nextAudioValue(
          assignment.operator,
          newPitchShift,
          value,
        );
        audioProperties.pitchShift = newPitchShift;
        pitchShiftModified = true;
      }
    } catch (error) {
      console.warn(
        `Failed to evaluate ${assignment.parameter} transform: ${errorMessage(error)}`,
      );
    }
  }

  return {
    gain: gainModified
      ? Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, newGainDb))
      : null,
    pitchShift: pitchShiftModified
      ? Math.max(MIN_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, newPitchShift))
      : null,
  };
}

/**
 * Apply an audio assignment operator to the current value: `set` replaces,
 * `+=` (the only other operator) adds.
 * @param operator - The assignment operator ("set" or "add")
 * @param current - The current accumulated value
 * @param value - The evaluated right-hand-side value
 * @returns The new value
 */
function nextAudioValue(
  operator: string,
  current: number,
  value: number,
): number {
  return operator === "set" ? value : current + value;
}

/**
 * Detect a bare top-level pitch literal assigned to an audio parameter
 * (`gain = C3`, `pitchShift = C3`) and warn-and-skip it. Audio clips have no
 * pitch, and gain/pitchShift are plain numbers; assigning a pitch literal would
 * silently coerce to a MIDI number (`C3` → 60, clamped to the parameter max).
 * Mirrors the note evaluator's pitch-as-value guard. A pitch literal nested in
 * arithmetic or a function arg is NOT caught here — it is still resolved to its
 * MIDI number in evaluateAudioExpression.
 * @param assignment - The audio transform assignment to check
 * @returns true if the assignment was a bare pitch literal (warned + skip), else false
 */
function warnAndSkipBarePitchLiteral(assignment: TransformAssignment): boolean {
  const expr = assignment.expression;

  if (typeof expr !== "object" || expr.type !== "pitchLiteral") return false;

  const example = assignment.parameter === "gain" ? "-6" : "12";

  console.warn(
    `pitch name "${expr.name}" isn't a valid value for ${assignment.parameter}; audio clips have no pitch — gain and pitchShift take numbers (e.g. ${assignment.parameter} = ${example}). Skipping "${assignment.parameter} ${operatorDisplay(assignment.operator)}".`,
  );

  return true;
}

/**
 * Warn about transform selectors/parameters that have no effect on audio clips.
 * MIDI-only parameters and timeRange selectors are dropped (audio transforms
 * apply to the whole clip), so warn rather than silently ignoring them.
 * @param ast - Parsed transform assignments
 */
function warnIncompatibleAudioSelectors(ast: TransformStatement[]): void {
  const assignments = ast.filter((a): a is TransformAssignment => !isNoteOp(a));

  if (assignments.some((a) => MIDI_PARAMETERS.has(a.parameter))) {
    console.warn(
      "MIDI parameters (velocity, timing, duration, probability, deviation, pitch) ignored for audio clips",
    );
  }

  const hasAudioTimeRange = assignments.some(
    (a) =>
      (a.parameter === "gain" || a.parameter === "pitchShift") &&
      a.timeRange != null,
  );

  if (hasAudioTimeRange) {
    console.warn(
      "timeRange selector ignored for audio clip transform (audio transforms apply to the whole clip)",
    );
  }

  const hasAudioPitchRange = assignments.some(
    (a) =>
      (a.parameter === "gain" || a.parameter === "pitchShift") &&
      a.pitchRange != null,
  );

  if (hasAudioPitchRange) {
    console.warn(
      "pitch selector ignored for audio clip transform (audio clips have no pitch)",
    );
  }

  const hasAudioPredicate = assignments.some(
    (a) =>
      (a.parameter === "gain" || a.parameter === "pitchShift") &&
      a.predicate != null,
  );

  if (hasAudioPredicate) {
    console.warn(
      "where() predicate ignored for audio clip transform (audio transforms apply to the whole clip)",
    );
  }

  if (ast.some(isNoteOp)) {
    console.warn(
      "Note-count operations (ratchet, repeat, merge, split) ignored for audio clips",
    );
  }
}

type BinaryOpNode = {
  type: "add" | "subtract" | "multiply" | "divide" | "modulo";
  left: ExpressionNode;
  right: ExpressionNode;
};

/**
 * Evaluate an expression in audio context
 * @param node - Expression node to evaluate
 * @param audioProperties - Audio properties for variable access
 * @param clipContext - Optional clip-level context for clip/bar variables
 * @returns Evaluated numeric result
 */
function evaluateAudioExpression(
  node: ExpressionNode,
  audioProperties: AudioProperties,
  clipContext?: ClipContext,
): number {
  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Absolute duration (n/4, n/8, ...) — e.g. a synced waveform period. Resolve
  // against the clip's real meter denominator so the period lands in the same
  // musical-beats frame as clip.barDuration/clip.position (a one-bar period in
  // 6/8 is `n6/8` = 6 musical beats, matching clip.barDuration). Falls back to
  // 4/4 when no clip context is available (e.g. session-only callers).
  if (node.type === "nDuration") {
    return wholeNoteFractionToMusicalBeats(
      node.wholeNoteFraction,
      clipContext?.timeSigDenominator ?? 4,
    );
  }

  // Bar duration (Nbar) — N bars in musical beats. Uses the clip's real
  // beats-per-bar when known, else assumes 4/4 (same as the nDuration fallback).
  if (node.type === "barDuration") {
    return node.bars * (clipContext?.barDuration ?? 4);
  }

  // Pitch literal (`C3`) nested in an expression (arithmetic operand or function
  // arg, e.g. `gain = C3 + 0`) — its MIDI number, mirroring the note evaluator.
  // A bare top-level `gain = C3` never reaches here: applyAudioTransform catches
  // and warns it. This branch only stops a nested pitch literal from falling
  // through to the function-call branch below and throwing a cryptic
  // "args is undefined" internal error.
  if (node.type === "pitchLiteral") {
    return node.value;
  }

  // Variable lookup
  if (node.type === "variable") {
    return resolveAudioVariable(node, audioProperties, clipContext);
  }

  // Arithmetic operators
  if (
    node.type === "add" ||
    node.type === "subtract" ||
    node.type === "multiply" ||
    node.type === "divide" ||
    node.type === "modulo"
  ) {
    return evaluateBinaryOp(node, audioProperties, clipContext);
  }

  // Function calls - node is a FunctionNode at this point (all other types handled above)
  const funcNode = node as {
    type: "function";
    name: string;
    args: ExpressionNode[];
    sync: boolean;
    raw: boolean;
  };

  // Use position=0 for audio context (clip-level transform). Pass the clip's
  // real meter so synced waveform periods (n<frac>) and any Nbar/timeRange math
  // resolve in the same musical-beats frame as clip.barDuration/clip.position;
  // the default one-bar timeRange is the clip's beats-per-bar. All default to
  // 4/4 when no clip context is available.
  const clipProps = buildClipNoteProperties(clipContext);
  const numerator = clipContext?.barDuration ?? 4;
  const denominator = clipContext?.timeSigDenominator ?? 4;

  return evaluateFunction(
    funcNode.name,
    funcNode.args,
    funcNode.sync,
    funcNode.raw,
    0, // position
    numerator, // timeSigNumerator (= clip beats-per-bar)
    denominator, // timeSigDenominator
    { start: 0, end: numerator }, // timeRange (one bar in musical beats)
    clipProps,
    (expr, pos, num, denom, range, _props) =>
      evaluateAudioExpressionWithContext(
        expr,
        audioProperties,
        clipContext,
        pos,
        num,
        denom,
        range,
      ),
  );
}

/**
 * Resolve a variable reference in audio context
 * @param node - Variable node with namespace and name
 * @param node.namespace - Variable namespace (note, audio, clip)
 * @param node.name - Variable name within namespace
 * @param audioProperties - Audio properties for audio.* variables
 * @param clipContext - Optional clip context for clip.* variables
 * @returns Resolved variable value
 */
function resolveAudioVariable(
  node: { namespace: string; name: string },
  audioProperties: AudioProperties,
  clipContext?: ClipContext,
): number {
  if (node.namespace === "note" || node.namespace === "next") {
    throw new Error(
      `Cannot use ${node.namespace}.${node.name} variable in audio clip context`,
    );
  }

  if (node.namespace === "audio") {
    return audioProperties[node.name as keyof AudioProperties];
  }

  if (node.namespace === "clip") {
    if (clipContext == null) {
      throw new Error(
        `Variable "clip.${node.name}" is not available in this context`,
      );
    }

    const clipProps: Record<string, number | undefined> = {
      barDuration: clipContext.barDuration,
      duration: clipContext.clipDuration,
      index: clipContext.clipIndex,
      count: clipContext.clipCount,
      position: clipContext.arrangementStart,
    };

    if (node.name === "position" && clipContext.arrangementStart == null) {
      // Session clips have no arrangement origin; 0 is the neutral position so
      // the transform keeps running instead of failing the clip.
      console.warn(`clip.position is not available for session clips; using 0`);

      return 0;
    }

    const value = clipProps[node.name];

    if (value != null) return value;
  }

  throw new Error(
    `Variable "${node.namespace}.${node.name}" is not available in this context`,
  );
}

/**
 * Evaluate binary operation in audio context
 * @param node - Binary operation node
 * @param audioProperties - Audio properties for variable access
 * @param clipContext - Optional clip-level context
 * @returns Evaluated numeric result
 */
function evaluateBinaryOp(
  node: BinaryOpNode,
  audioProperties: AudioProperties,
  clipContext?: ClipContext,
): number {
  const left = evaluateAudioExpression(node.left, audioProperties, clipContext);
  const right = evaluateAudioExpression(
    node.right,
    audioProperties,
    clipContext,
  );

  switch (node.type) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      return right === 0 ? 0 : left / right;
    case "modulo":
      // Modulo by zero yields 0 (same as division)
      // Use wraparound behavior: ((val % n) + n) % n
      return right === 0 ? 0 : ((left % right) + right) % right;
  }
}

/**
 * Evaluate expression with context (for function callbacks)
 * @param node - Expression node to evaluate
 * @param audioProperties - Audio properties for variable access
 * @param clipContext - Optional clip-level context
 * @param _position - Position in beats (unused in audio context)
 * @param _timeSigNumerator - Time signature numerator (unused)
 * @param _timeSigDenominator - Time signature denominator (unused)
 * @param _timeRange - Time range (unused)
 * @param _timeRange.start - Start of time range
 * @param _timeRange.end - End of time range
 * @returns Evaluated numeric result
 */
function evaluateAudioExpressionWithContext(
  node: ExpressionNode,
  audioProperties: AudioProperties,
  clipContext: ClipContext | undefined,
  _position: number,
  _timeSigNumerator: number,
  _timeSigDenominator: number,
  _timeRange: { start: number; end: number },
): number {
  return evaluateAudioExpression(node, audioProperties, clipContext);
}

/**
 * Build NoteProperties from ClipContext for function evaluation in audio context
 * @param clipContext - Optional clip-level context
 * @returns NoteProperties with clip-level values for function access
 */
function buildClipNoteProperties(clipContext?: ClipContext): NoteProperties {
  if (!clipContext) return {};

  const props: NoteProperties = {
    "clip:index": clipContext.clipIndex,
    "clip:count": clipContext.clipCount,
    "clip:duration": clipContext.clipDuration,
    "clip:barDuration": clipContext.barDuration,
  };

  if (clipContext.arrangementStart != null) {
    props["clip:position"] = clipContext.arrangementStart;
  }

  return props;
}
