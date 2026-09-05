// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Catch an LFO that came out flat.
 *
 * A waveform's first argument is a PERIOD in beats, and models routinely pass a
 * phase expression instead. Both mistakes land on one phase for every note, so
 * every note gets the same value: `sin(1)` on quarter notes samples phase 0
 * each beat, and `sin(note.start * k)` is constant by construction, since
 * `start / (start * k)` is `1/k` whatever the note. Nothing else notices — the
 * write succeeds and reports the full `transformed` count, which reads as
 * success and has talked a model out of a working LFO.
 */

import * as console from "../transform-warning-label.ts";
import { type ExpressionNode } from "../parser/transform-parser.ts";

/**
 * The periodic functions, i.e. the ones that can come out flat. Paired with the
 * `switch` in transform-functions.ts `evaluateWaveform`; a new waveform belongs
 * in both, and `transform-flat-waveform.test.ts` fails if it is missing here.
 */
const WAVEFORM_NAMES = new Set(["cos", "sin", "tri", "saw", "square"]);

/**
 * Find the first waveform call in an expression.
 * @param expr - Expression to walk
 * @returns The waveform's name, or null when the expression has none
 */
export function findWaveformName(expr: ExpressionNode): string | null {
  if (typeof expr === "number" || !("type" in expr)) return null;

  if (expr.type === "function") {
    if (WAVEFORM_NAMES.has(expr.name)) return expr.name;

    for (const arg of expr.args) {
      const nested = findWaveformName(arg);

      if (nested != null) return nested;
    }

    return null;
  }

  // Binary nodes carry the OPERATOR as their type ("add", "multiply", ...),
  // so match on shape rather than listing every operator.
  if ("left" in expr && "right" in expr) {
    return findWaveformName(expr.left) ?? findWaveformName(expr.right);
  }

  return null;
}

/**
 * Warn when a waveform gave every note it touched the same value.
 *
 * Exact equality on purpose: a real LFO that happens to land near one value
 * still varies, so only a genuinely degenerate period trips this.
 *
 * @param name - Waveform function name, for the message
 * @param values - Values the assignment produced, one per transformed note
 */
export function warnIfFlatWaveform(name: string, values: number[]): void {
  if (values.length < 2) return;

  const first = values[0] as number;

  if (values.some((value) => value !== first)) return;

  console.warn(
    `${name}() gave all ${values.length} notes the same value — a flat LFO. ` +
      `Its first argument is a period in beats, and a period that divides the ` +
      `note spacing samples one phase. Try a longer period, e.g. ${name}(2bar).`,
  );
}
