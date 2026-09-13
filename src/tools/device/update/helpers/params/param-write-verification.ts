// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type WrittenParam,
  readParameterBasic,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { setParamValueAndVerify } from "#src/tools/shared/device/helpers/param-writing.ts";

/** A param one write landed on, or the reason it landed nowhere. */
export type ParamWriteOutcome = WrittenParam | { reason: string };

/**
 * Write a raw value and name the param for the caller. The value is not read
 * here — `refreshParamValues` reads it after everything else in the call has
 * run.
 * @param param - Parameter to write
 * @param rawValue - Raw value to write
 * @param changed - Why the value that lands isn't the one asked for, when it
 *   isn't: the param reports the value anyway, plus this as its reason
 * @returns The param the write landed on, or why it landed nowhere
 */
export function writeParam(
  param: LiveAPI,
  rawValue: number,
  changed?: string,
): ParamWriteOutcome {
  const refused = setParamValueAndVerify(param, rawValue);

  if (refused != null) {
    // Both facts: Live took nothing, and the value it was offered was already
    // not the one asked for.
    return {
      reason: changed == null ? refused : `${refused} It ${changed}`,
    };
  }

  const written = readParameterBasic(param);

  return changed == null ? written : { ...written, reason: changed };
}
