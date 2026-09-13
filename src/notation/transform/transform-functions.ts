// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "./transform-warning-label.ts";
import {
  computePhase,
  evaluateArgs,
} from "./helpers/functions/function-arguments.ts";
import {
  evaluateSnap,
  evaluateStep,
} from "./helpers/functions/grid-functions.ts";
import {
  evaluateChoose,
  evaluateClipSeq,
  evaluateRand,
  evaluateSeq,
} from "./helpers/functions/sequence-functions.ts";
import {
  evaluateCurve,
  evaluateMathFunction,
  evaluateMinMax,
  evaluatePow,
} from "./helpers/functions/shape-functions.ts";
import {
  evaluateLegato,
  evaluateQuant,
  evaluateSwing,
} from "./helpers/functions/timing-functions.ts";
import { type EvalContext } from "./helpers/transform-context.ts";
import { type ExpressionNode } from "./parser/transform-parser.ts";
import * as waveforms from "./transform-waveforms.ts";

// Dispatch map for functions with the standard (args, ctx) signature
const standardFnDispatch: Record<string, typeof evaluateRand | undefined> = {
  rand: evaluateRand,
  seq: evaluateSeq,
  clipseq: evaluateClipSeq,
  choose: evaluateChoose,
  snap: evaluateSnap,
  quant: evaluateQuant,
  step: evaluateStep,
  pow: evaluatePow,
  curve: evaluateCurve,
  ramp: evaluateRamp,
};

/**
 * Evaluate a function call
 * @param name - Function name
 * @param args - Function arguments
 * @param sync - Whether to sync phase to arrangement timeline
 * @param raw - Whether to skip auto-quantize (swing only)
 * @param ctx - Evaluation context
 * @returns Evaluated function result
 */
export function evaluateFunction(
  name: string,
  args: ExpressionNode[],
  sync: boolean,
  raw: boolean,
  ctx: EvalContext,
): number {
  // legato([tolerance]) — duration to next distinct start time (skips chord tones)
  if (name === "legato") {
    return evaluateLegato(args, ctx);
  }

  // swing() has its own signature due to the raw flag
  if (name === "swing") {
    return evaluateSwing(args, raw, ctx);
  }

  // Functions with standard signature: (args, ctx)
  const standardFn = standardFnDispatch[name];

  if (standardFn) {
    return standardFn(args, ctx);
  }

  // Math functions with name dispatch (round, floor, ceil, abs, clamp)
  if (
    name === "round" ||
    name === "floor" ||
    name === "ceil" ||
    name === "abs" ||
    name === "clamp" ||
    name === "wrap" ||
    name === "reflect"
  ) {
    return evaluateMathFunction(name, args, ctx);
  }

  // Math functions - variadic (min, max)
  if (name === "min" || name === "max") {
    return evaluateMinMax(name, args, ctx);
  }

  // All other waveforms require at least a period argument
  return evaluateWaveform(name, args, sync, ctx);
}

/**
 * Evaluate ramp function
 * @param args - Function arguments (exactly 2: start, end)
 * @param ctx - Evaluation context
 * @returns Ramp value
 */
function evaluateRamp(args: ExpressionNode[], ctx: EvalContext): number {
  if (args.length !== 2) {
    throw new Error(
      `Function ramp() requires exactly 2 arguments: ramp(start, end)`,
    );
  }

  const [start, end] = evaluateArgs(args, [0, 1], ctx);

  return waveforms.ramp(computePhase(ctx), start, end);
}

/**
 * Evaluate waveform function (cos, sin, tri, saw, square)
 * @param name - Waveform function name
 * @param args - Function arguments
 * @param sync - Whether to sync phase to arrangement timeline
 * @param ctx - Evaluation context
 * @returns Waveform value
 */
function evaluateWaveform(
  name: string,
  args: ExpressionNode[],
  sync: boolean,
  ctx: EvalContext,
): number {
  const { position, noteProperties } = ctx;

  // All waveforms require at least a period argument. square also takes an
  // optional pulseWidth (3rd arg); the rest cap at period + phase. sync is a
  // trailing keyword, not an arg, so it isn't counted here.
  if (args.length === 0) {
    throw new Error(`Function ${name}() requires at least a period argument`);
  }

  const maxArgs = name === "square" ? 3 : 2;

  if (args.length > maxArgs) {
    const signature =
      name === "square"
        ? `${name}(period, [phase], [pulseWidth])`
        : `${name}(period, [phase])`;

    throw new Error(
      `Function ${name}() takes at most ${maxArgs} arguments: ${signature}`,
    );
  }

  // First argument is the period: a note-value or numeric expression, in beats
  const period = parsePeriod(args[0] as ExpressionNode, ctx, name);

  // Sync: use absolute arrangement position for phase
  let effectivePosition = position;

  if (sync) {
    const arrangementStart = noteProperties["clip:position"];

    if (arrangementStart == null) {
      // Session clips have no arrangement origin to anchor phase. Degrade
      // gracefully to clip-relative (phase resets at clip start) instead of
      // skipping the whole assignment — mirrors the clip.position variable
      // fallback. effectivePosition stays at the clip-relative position.
      console.warn("sync ignored on session clip — LFO is clip-relative");
    } else {
      effectivePosition = position + arrangementStart;
    }
  }

  // Calculate phase from position and period
  const basePhase = (effectivePosition / period) % 1.0;

  // Optional second argument: phase offset
  let phaseOffset = 0;

  if (args.length >= 2) {
    phaseOffset = ctx.evaluateExpression(args[1] as ExpressionNode, ctx);
  }

  const phase = basePhase + phaseOffset;

  // Call the waveform function
  switch (name) {
    case "cos":
      return waveforms.cos(phase);

    case "sin":
      return waveforms.sin(phase);

    case "tri":
      return waveforms.tri(phase);

    case "saw":
      return waveforms.saw(phase);

    case "square": {
      // Optional third argument: pulseWidth
      let pulseWidth = 0.5; // default

      if (args.length >= 3) {
        pulseWidth = ctx.evaluateExpression(args[2] as ExpressionNode, ctx);
      }

      return waveforms.square(phase, pulseWidth);
    }

    default:
      throw new Error(`Unknown waveform function: ${name}()`);
  }
}

/**
 * Parse period argument for waveform/timing functions.
 * The period is any numeric expression — a note value (e.g. `n/4`), a variable
 * (e.g. `clip.barDuration`), or a bare number — evaluated to musical beats.
 * @param periodArg - Period expression
 * @param ctx - Evaluation context
 * @param name - Function name for error messages
 * @returns Period in beats
 */
export function parsePeriod(
  periodArg: ExpressionNode,
  ctx: EvalContext,
  name: string,
): number {
  const period = ctx.evaluateExpression(periodArg, ctx);

  if (period <= 0) {
    throw new Error(
      `Function ${name}() period must be > 0, got ${period}. The first ` +
        `argument is a period in beats (e.g. n/4, 2bar), not a phase.`,
    );
  }

  return period;
}
