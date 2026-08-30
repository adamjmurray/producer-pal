// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { parseLabel } from "#src/tools/shared/device/helpers/device-label-helpers.ts";
import {
  type KnownParamUnit,
  canonicalUnit,
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
  /** How to name the parameter in a warning. */
  label: string;
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
 * @returns The value in the param's own display scale, or null to refuse
 */
export function displayValueForWrite(ctx: WriteUnitContext): number | null {
  const requested = parseLabel(ctx.writtenText).unit;

  if (requested == null) return ctx.inputValue;

  // A param whose own labels carry a unit is already canonical on both sides:
  // its display range was parsed through the same conversion the input was.
  if (ctx.labelUnit != null) {
    return requested === ctx.labelUnit ? ctx.inputValue : refuse(ctx);
  }

  if (ctx.known == null) return refuse(ctx);

  // A recorded unit describes what the param *displays*, which is not always
  // canonical: Glue Compressor's Release shows seconds. Put the value back on
  // that scale so it can be searched against the param's own range.
  const { canonical, scale } = canonicalUnit(ctx.known.unit);

  if (requested !== canonical) return refuse(ctx);

  return ctx.inputValue / scale;
}

/**
 * Warn that the written unit isn't the param's, and refuse the write. Says what
 * the param does measure whenever that is known, so the retry can be right.
 * @param ctx - The written value and what is known about the param's units
 * @returns null, always — the caller returns this as the refusal
 */
function refuse(ctx: WriteUnitContext): null {
  const actual = ctx.labelUnit ?? ctx.known?.unit;

  console.warn(
    actual == null
      ? `${ctx.label} displays a plain number from ${ctx.minLabel} to ${ctx.maxLabel} and never says what it measures, so "${ctx.writtenText}" was not written — send the number on its own.`
      : `${ctx.label} is measured in ${actual}, so "${ctx.writtenText}" was not written — send the value in ${actual}.`,
  );

  return null;
}
