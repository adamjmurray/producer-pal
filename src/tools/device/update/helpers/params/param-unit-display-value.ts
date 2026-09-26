// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseLabel } from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import { type ParamStep } from "#src/tools/shared/device/helpers/param-writing.ts";
import {
  type KnownParamUnit,
  canonicalUnit,
  splitLeadingNumber,
} from "#src/tools/shared/device/known-param-units.ts";

/** What a numeric write needs to know about the param's units. */
export interface WriteUnitContext {
  /** The value as the caller wrote it, unit and all. */
  writtenText: string;
  /** That value as a number, already canonical (seconds folded into ms). */
  inputValue: number;
  /** The unit the param's own labels carry, if any. */
  labelUnit: string | null;
  /** The recorded unit for a param whose labels carry none. */
  known: KnownParamUnit | null;
  /** The param's display range, named by its trimmed ends. */
  minLabel: string;
  maxLabel: string;
}

/**
 * The display value to write, or null to refuse the write.
 *
 * The unit used to be parsed off a value and then dropped, so only the number
 * survived: "50 dB" on a 0-100% param wrote 50% and reported success. Worse,
 * parseLabel folds s into ms, so "0.5 s" reached a param displaying a bare
 * 0.1-1.2 (Glue Compressor's Release) as 500 — out of range, clamped to the
 * maximum, and warned about as if 0.5 had been the invalid part.
 *
 * Matching is by quantity, not spelling: s and ms are one unit here, as are Hz
 * and kHz, so either lands on either. A value with no unit is always allowed —
 * it's the documented way to write one, and the only way to reach a param whose
 * unit nobody has recorded.
 * @param ctx - The written value and what is known about the param's units
 * @returns The value in the param's own display scale, or the refusal
 */
export function displayValueForWrite(ctx: WriteUnitContext): ParamStep<number> {
  const requested = parseLabel(ctx.writtenText).unit;

  if (requested != null) {
    // A param whose own labels carry a unit is already canonical on both
    // sides: its display range was parsed through the same conversion the
    // input was.
    if (ctx.labelUnit != null) {
      return requested === ctx.labelUnit
        ? { value: ctx.inputValue }
        : refuse(ctx);
    }

    if (ctx.known == null) {
      return refuse(ctx);
    }

    // A recorded unit describes what the param *displays*, which is not
    // always canonical: Glue Compressor's Release shows seconds. Put the
    // value back on that scale so it can be searched against the param's
    // own range.
    const { canonical, scale } = canonicalUnit(ctx.known.unit);

    return requested === canonical
      ? { value: ctx.inputValue / scale }
      : refuse(ctx);
  }

  // parseLabel doesn't recognize every unit read-device records (Erosion's
  // "octaves", say) — that spelling stands for itself. No trailing text at
  // all is the documented no-unit case and is always allowed; anything else
  // still has to match the param's own recorded unit.
  const trailing = splitLeadingNumber(ctx.writtenText)?.trailing;

  if (!trailing) {
    return { value: ctx.inputValue };
  }

  return ctx.known != null &&
    trailing.toLowerCase() === ctx.known.unit.toLowerCase()
    ? { value: ctx.inputValue }
    : refuse(ctx);
}

/**
 * Refuse the write, saying the written unit isn't the param's. Says what the
 * param does measure whenever that is known, so the retry can be right.
 * @param ctx - The written value and what is known about the param's units
 * @returns The refusal, which the caller returns as-is
 */
function refuse(ctx: WriteUnitContext): { reason: string } {
  const actual = ctx.labelUnit ?? ctx.known?.unit;

  return {
    reason:
      actual == null
        ? `displays a plain number from ${ctx.minLabel} to ${ctx.maxLabel} and never says what it measures, so "${ctx.writtenText}" was not written — send the number on its own`
        : `is measured in ${actual}, so "${ctx.writtenText}" was not written — send the value in ${actual}`,
  };
}
