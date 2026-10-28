// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type WrittenParam,
  readParameterBasic,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  setParamValueAndVerify,
  setRawParamValueAndVerify,
} from "#src/tools/shared/device/helpers/param-writing.ts";
import { writeCheckingOverride } from "#src/tools/shared/arrangement/tracks/automation-override.ts";

/** What the caller asked for, for the entry that reports the write. */
export interface WriteReport {
  /** Why the value that lands isn't the one asked for, when it isn't */
  changed?: string;
  /** The value asked for, when it is a bare number the read-back can be
   * compared with. A param that reads back the same number reports no value. */
  requested?: number;
  /** Check the write by raw value: the param's label never changes */
  verifyRaw?: boolean;
}

/** A param one write landed on, or the reason it landed nowhere. */
export type ParamWriteOutcome = WrittenParam | { reason: string };

/**
 * Write a raw value and name the param for the caller. The value is not read
 * here — `refreshParamValues` reads it after everything else in the call has
 * run.
 * @param param - Parameter to write
 * @param rawValue - Raw value to write
 * @param report - What the caller asked for, for the entry to report against
 * @returns The param the write landed on, or why it landed nowhere
 */
export function writeParam(
  param: LiveAPI,
  rawValue: number,
  report: WriteReport = {},
): ParamWriteOutcome {
  const { changed, requested, verifyRaw } = report;
  const verify = verifyRaw ? setRawParamValueAndVerify : setParamValueAndVerify;
  const { result: refused, overrode } = writeCheckingOverride(param, () =>
    verify(param, rawValue),
  );

  if (refused != null) {
    // Both facts: Live took nothing, and the value it was offered was already
    // not the one asked for.
    return {
      reason: changed == null ? refused : `${refused} It ${changed}`,
    };
  }

  return {
    ...readParameterBasic(param),
    ...(changed == null ? {} : { detail: changed }),
    ...(requested == null ? {} : { requested }),
    ...(overrode ? { overrode: true as const } : {}),
  };
}
