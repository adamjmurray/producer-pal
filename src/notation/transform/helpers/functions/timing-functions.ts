// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "../../transform-warning-label.ts";
import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { parsePeriod } from "../../transform-functions.ts";
import { type EvalContext } from "../transform-context.ts";

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
  if (args.length === 0 || args.length > 2) {
    throw new Error(
      `Function swing() requires 1-2 arguments: swing(amount [, grid])`,
    );
  }

  const amount = ctx.evaluateExpression(args[0] as ExpressionNode, ctx);

  // Default grid is half a musical beat — the off-beat between the meter's
  // beats: an 8th note in x/4, a 16th in x/8, etc. (the natural swing
  // subdivision per meter). NOT a fixed n/8 — that coincides only in x/4.
  // Pass an explicit grid arg to override.
  let grid = 0.5;

  if (args.length === 2) {
    grid = parsePeriod(args[1] as ExpressionNode, ctx, "swing");
  }

  const period = grid * 2;

  // Auto-quantize: snap to grid/4 before applying swing (unless raw).
  // Uses grid/4 (not grid) to preserve notes at finer subdivisions
  // (e.g. 16th notes during 8th-note swing).
  let effectivePosition = ctx.position;

  if (!raw) {
    const quantGrid = grid / 4;

    effectivePosition = Math.round(ctx.position / quantGrid) * quantGrid;
  }

  // Phase within the period cycle (0-1)
  const phase = (effectivePosition / period) % 1.0;

  // On-beat (first half): no offset. Off-beat (second half): full offset.
  const offset = phase < 0.5 ? 0 : amount;

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
  if (args.length !== 1) {
    throw new Error(
      `Function quant() requires exactly 1 argument: quant(grid)`,
    );
  }

  const grid = parsePeriod(args[0] as ExpressionNode, ctx, "quant");

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
  if (args.length > 1) {
    throw new Error("legato() accepts at most 1 argument (tolerance)");
  }

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
  console.warn(
    "legato(): no next note and no clip end for the last note; keeping current duration",
  );

  // duration is always populated by buildNoteProperties for note transforms.
  return ctx.noteProperties.duration as number;
}
