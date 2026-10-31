// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { clipDetail } from "../../transform-warning-label.ts";
import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvalContext } from "../transform-context.ts";
import { GRID_EPSILON } from "../note-ops/note-cuts.ts";
import { DEFAULT_SWING_GRID, swingAmountError } from "./swing-amount.ts";

/**
 * Evaluate swing function (delay off-beat notes for swing feel).
 * Returns absolute position — use with `timing =`.
 * @param args - Function arguments (1-2: amount, optional grid)
 * @param raw - If true, skip auto-quantize
 * @param ctx - Evaluation context
 * @returns Absolute position with swing applied
 */
export function evaluateSwing(
  args: ExpressionNode[],
  raw: boolean,
  ctx: EvalContext,
): number {
  const amount = ctx.evaluateExpression(args[0] as ExpressionNode, ctx);

  // Default grid is half a musical beat — the off-beat between the meter's
  // beats: an 8th note in x/4, a 16th in x/8, etc. (the natural swing
  // subdivision per meter). NOT a fixed n/8 — that coincides only in x/4.
  // Pass an explicit grid arg to override.
  let grid = DEFAULT_SWING_GRID;

  if (args.length === 2) {
    grid = parseGrid(args[1] as ExpressionNode, ctx, "swing");
  }

  // The up-front check judges constants; this catches the rest (rand(), etc.).
  const refusal = swingAmountError(amount, grid);

  if (refusal != null) {
    throw new Error(refusal);
  }

  // Auto-quantize: snap to grid/4 before applying swing (unless raw).
  // Uses grid/4 (not grid) to preserve notes at finer subdivisions
  // (e.g. 16th notes during 8th-note swing).
  let effectivePosition = ctx.position;

  if (!raw) {
    // Round, don't floor, in the off-beat half: flooring pulls a slightly early
    // on-beat back a full step and breaks swinging humanized notes.
    const quantGrid = grid / 4;

    effectivePosition = Math.round(ctx.position / quantGrid) * quantGrid;
  }

  // Count whole grid steps, not a float phase: an exact n/12 step divided by the
  // period can land at 0.4999... and put an off-beat in the on-beat half.
  // The modulo keeps a pickup note before the clip start (negative) in the
  // right half.
  const step = Math.floor((effectivePosition + GRID_EPSILON) / grid);

  // On-beat (even step): no offset. Off-beat (odd step): full offset.
  const offset = Math.abs(step % 2) === 1 ? amount : 0;

  return effectivePosition + offset;
}

/**
 * Evaluate quant function (snap timing to nearest grid point).
 * Returns absolute position — use with `timing =`.
 * @param args - Function arguments (exactly 1: grid size)
 * @param ctx - Evaluation context
 * @returns Position snapped to nearest grid point
 */
export function evaluateQuant(
  args: ExpressionNode[],
  ctx: EvalContext,
): number {
  const grid = parseGrid(args[0] as ExpressionNode, ctx, "quant");

  return Math.round(ctx.position / grid) * grid;
}

/**
 * Evaluate the legato() function with optional tolerance.
 * Scans forward through filtered start times to find the next distinct position,
 * treating starts within tolerance as the same chord. Falls back to clip end
 * for the last note.
 * @param args - Function arguments (0 or 1: optional tolerance in beats)
 * @param ctx - Evaluation context (noteProperties includes _legatoContext)
 * @returns Duration to next distinct start time
 */
export function evaluateLegato(
  args: ExpressionNode[],
  ctx: EvalContext,
): number {
  const legato = ctx.noteProperties._legatoContext;

  if (!legato) {
    throw new Error("legato(): not available in this context");
  }

  const tolerance =
    args.length === 1
      ? ctx.evaluateExpression(args[0] as ExpressionNode, ctx)
      : 0;

  const noteStart = legato.starts[legato.cursor] as number;

  // Scan forward for next start beyond tolerance
  for (let k = legato.cursor + 1; k < legato.starts.length; k++) {
    if (Math.abs((legato.starts[k] as number) - noteStart) > tolerance) {
      return (legato.starts[k] as number) - noteStart;
    }
  }

  // Last note — extend to clip end
  if (legato.clipEnd != null) {
    return legato.clipEnd - noteStart;
  }

  // No next note and no known clip end (e.g. the final note in a context that
  // doesn't supply a clip length): keep the note's current duration rather than
  // failing the whole transform.
  clipDetail(
    "legato(): last note has no next note or clip end; kept its duration",
  );

  // duration is always populated by buildNoteProperties for note transforms.
  return ctx.noteProperties.duration as number;
}

/**
 * Parse a swing/quant grid argument. Unlike a waveform period, a grid of zero
 * or less has no meaning — it would divide by zero or snap backwards.
 * @param gridArg - Grid expression, in musical beats
 * @param ctx - Evaluation context
 * @param name - Function name for the error message
 * @returns Grid in beats
 */
function parseGrid(
  gridArg: ExpressionNode,
  ctx: EvalContext,
  name: string,
): number {
  const grid = ctx.evaluateExpression(gridArg, ctx);

  if (grid <= 0) {
    throw new Error(
      `Function ${name}() grid must be > 0, got ${grid}. The argument is a ` +
        `grid size in beats (e.g. n/8, n/16).`,
    );
  }

  return grid;
}
