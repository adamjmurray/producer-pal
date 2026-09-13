// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { unitForLabels } from "#src/tools/shared/device/helpers/param-label-parsing.ts";
import { type ParamNumericRange } from "#src/tools/shared/device/helpers/param-numeric-range.ts";
import { type ParamStep } from "#src/tools/shared/device/helpers/param-writing.ts";
import { recordedUnitFor } from "#src/tools/shared/device/known-param-units.ts";
import { findRawValueForDisplay } from "./param-display-search.ts";
import { displayValueForWrite } from "./param-unit-check.ts";
import {
  type ParamWriteOutcome,
  writeParam,
} from "./param-write-verification.ts";

/** Everything the numeric write path needs about the param and the request. */
export interface NumericWrite {
  param: LiveAPI;
  inputValue: number;
  range: ParamNumericRange | null;
  currentLabel: string;
  minLabel: string;
  maxLabel: string;
  writtenText: string;
  deviceName: string | undefined;
  paramName: string;
}

/**
 * Write a number to a param that displays a number line, converting from the
 * param's own display units. A param with no numeric range at all (a note-name
 * or word-list display) has nothing to convert, so the input goes to Live as a
 * raw value the way it always has.
 * @param write - The param, the requested value and the param's labels
 * @returns The param the write landed on, or why it landed nowhere
 */
export function setNumericParamValue(write: NumericWrite): ParamWriteOutcome {
  const { param, range } = write;
  // Name the range by its trimmed ends: a param with a word at one end
  // (Glue Compressor's Release tops out at "A") would otherwise be described
  // as running "from 0.1 to A".
  const ends = range ?? { minLabel: write.minLabel, maxLabel: write.maxLabel };
  const labelUnit = unitForLabels(
    write.currentLabel,
    ends.minLabel,
    ends.maxLabel,
  );
  const display = displayValueForWrite({
    writtenText: write.writtenText,
    inputValue: write.inputValue,
    labelUnit,
    known: recordedUnitFor(labelUnit, range, write.deviceName, write.paramName),
    minLabel: ends.minLabel,
    maxLabel: ends.maxLabel,
  });

  if (!("value" in display)) {
    return display;
  }

  const target: ParamStep<number> =
    range == null
      ? { value: display.value }
      : findRawValueForDisplay(param, display.value, range);

  if (!("value" in target)) {
    return target;
  }

  return writeParam(param, target.value, target.reason);
}
