// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { AUTOMATION_OVERRIDDEN } from "#src/tools/shared/arrangement/tracks/automation-override.ts";
import {
  joinDetails,
  replacerOf,
} from "#src/tools/shared/helpers/entry-details.ts";
import {
  differsAtPublishedResolution,
  readBackDetail,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  failUnreplacedEntries,
  type ReplacerAt,
} from "#src/tools/shared/write-pipeline/plans/replaced-entries.ts";
import {
  type LandedParam,
  type ParamOutcome,
  type ParamResult,
  type ParamValueResult,
  type SupersededParam,
  type WrittenParam,
  type WrittenPseudoParam,
  paramWritten,
  readParameter,
  skippedParam,
  type UnresolvedParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";

/** Why a pseudo-param a write landed on still has nothing to report. */
const NO_VALUE_AFTER_WRITE = "written, but no value reads back";

/**
 * Read the values of the params a call wrote, once everything else in that call
 * has run. An A/B compare swap or a macro-variation recall rewrites the values a
 * `params` write just landed, so reading at write time would report what the
 * same call went on to overwrite. This is the only place a written param's value
 * comes from, and it reads the same as read-device's, so a write and a read can
 * never disagree.
 *
 * Assumes the params are still there: nothing that runs after a `params` write
 * removes a device.
 *
 * The name stays as reported — a path-prefixed write is named by the path the
 * caller used, not by the param's own name. An entry that resolved to nothing
 * passes through: it has no id to read.
 * @param outcomes - Every param the call named
 * @returns The written ones with their current values, the rest unchanged
 */
export function refreshParamValues(outcomes: ParamOutcome[]): ParamResult[] {
  const read = outcomes.map((entry): ParamResult => {
    if (paramWritten(entry)) {
      return writtenResult(entry, readParameter(LiveAPI.from(entry.id)).value);
    }

    // A pseudo-param brings its own read; the read itself is not reported. A
    // meaningful null (e.g. Compressor's "No Input" sidechain source) reports
    // as a value. undefined means the param does not apply in the device's
    // current state — and only a param a write landed on gets here, so the
    // write went in and the device still shows nothing. That is a silent
    // refusal (an absolute `sample` path naming no file loads nothing), and
    // read-device omits the param too, so dropping the entry would leave
    // nothing anywhere to say the value never arrived.
    if ("read" in entry) {
      const value = entry.read();

      if (value === undefined) {
        return unlandedPseudoParam(entry, NO_VALUE_AFTER_WRITE);
      }

      // A device that ignored the write left the value it already had, and
      // reporting that as the value would read as a write that landed.
      const failed = entry.writeFailed?.(value);

      return failed == null
        ? { name: entry.name, value }
        : unlandedPseudoParam(entry, failed);
    }

    return entry;
  });

  return failUnreplacedParams(outcomes, read);
}

/**
 * Fail the params a later entry was to replace when that entry's write then
 * landed nothing. This is known only after the read-back, which can show a
 * pseudo-param's write didn't land.
 * @param outcomes - Every param the call named
 * @param read - What each one came to, in the same order
 * @returns The entries, each unreplaced one now a failure
 */
function failUnreplacedParams(
  outcomes: ParamOutcome[],
  read: ParamResult[],
): ParamResult[] {
  const replacers = new Map<number, ReplacerAt>();

  for (const [index, outcome] of outcomes.entries()) {
    const replacer = replacerOf(outcome);

    if (replacer != null) {
      replacers.set(index, {
        index: outcomes.indexOf(replacer.entry as ParamOutcome),
        by: replacer.by,
      });
    }
  }

  return failUnreplacedEntries(
    read,
    replacers,
    (entry) => "ok" in entry,
    (entry, detail) => {
      const { detail: _replaced, ...address } = entry as SupersededParam;

      return { ...address, ok: false, detail };
    },
  );
}

/**
 * The entry for a pseudo-param whose write the read-back shows didn't land.
 * @param entry - The written pseudo-param
 * @param detail - Why it didn't land
 * @returns The skip entry, naming anything the call made for the write
 */
function unlandedPseudoParam(
  entry: WrittenPseudoParam,
  detail: string,
): UnresolvedParam {
  return skippedParam(
    entry.name,
    entry.made == null ? detail : `${detail}; ${entry.made}`,
  );
}

/**
 * One written param's entry. A bare number that reads back as the one asked for
 * is left out: the caller wrote it, so repeating it says nothing. Everything
 * else reports what the param reads now, plus why it isn't the value
 * asked for.
 *
 * The comparison is exact, because the read already publishes the value at the
 * param's own display precision — rounding it again would call a step the
 * param really moved to the same value.
 * @param entry - The param the write landed on
 * @param value - What it reads as now
 * @returns The result entry
 */
function writtenResult(
  entry: WrittenParam,
  value: unknown,
): ParamValueResult | LandedParam {
  const { id, name, requested } = entry;
  const changed =
    requested == null || differsAtPublishedResolution(requested, value);

  if (!changed && entry.detail == null) {
    return withOverride({ id, name }, entry);
  }

  // A value the write itself knew it changed says why; one only the read-back
  // reveals (a pan step, an A/B swap later in the call) says what it is.
  const detail =
    entry.detail ??
    (changed && requested != null ? readBackDetail(["value"]) : undefined);

  return withOverride(
    detail == null ? { id, name, value } : { id, name, value, detail },
    entry,
  );
}

/**
 * Say on a written param's entry that its write overrode the arrangement lane.
 * The value is reported only when it already was.
 * @param result - The entry, before the override
 * @param entry - The param the write landed on
 * @returns The entry, with the override joined onto its detail
 */
function withOverride<T extends LandedParam | ParamValueResult>(
  result: T,
  entry: WrittenParam,
): T {
  if (entry.overrode !== true) {
    return result;
  }

  const detail = joinDetails([
    "detail" in result ? result.detail : undefined,
    AUTOMATION_OVERRIDDEN,
  ]);

  return { ...result, detail };
}
