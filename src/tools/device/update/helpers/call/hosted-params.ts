// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The `params` of a hosted plug-in's wrapper device. The wrapper isn't the
// plug-in: its params are the plug-in's own, addressed by name or `h<number>`,
// and set in display units. The wrapper finds the 0-1 value that displays as
// asked, for the whole list in one request. That request is async, so it is
// settled ahead of the rest of the target's update, and each param entry is
// handed on with what it came to.

import {
  type ParamEntry,
  paramEntryKey,
} from "#src/tools/device/update/device-params-schema.ts";
import { normalizeParamValue } from "#src/tools/device/update/update-device-param-parser.ts";
import {
  type LandedParam,
  type ParamOutcome,
  type ParamValueResult,
  skippedParam,
  skippedParamById,
  supersededParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  type ParsedLabel,
  parseLabel,
} from "#src/tools/shared/device/helpers/params/param-label-parsing.ts";
import {
  detectHostedPlugin,
  type HostedPlugin,
  hostedParamId,
  noPluginDetail,
  parseHostedParamId,
} from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import { type SettledParams } from "./simpler-pitch-bend.ts";
import { isDeviceClass } from "#src/tools/shared/device/is-device-class.ts";
import { linkReplacer } from "#src/tools/shared/helpers/entry-details.ts";
import {
  differsAtPublishedResolution,
  readBackDetail,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  NO_ANSWER,
  type PluginHostResponse,
  requestPluginHost,
} from "#src/live-api-adapter/protocols/plugin-host-v8-protocol.ts";
import { namedAgain } from "#src/shared/max/named-again-wording.ts";
import { unreachedDetail } from "#src/tools/shared/validation/lists/named-targets.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** Set once a write gets no answer, so the targets after it aren't tried. */
export interface HostedStall {
  reason?: string;
}

/** Why entries are refused when a wrapper gives no answer to a write. */
export const WRAPPER_SILENT = "not set: the hosted plug-in didn't answer";

/** What the write needs from the call. */
interface HostedCall {
  deadline: number | null | undefined;
  /** Told that a write may have changed Live, for a later throw to say so */
  landed: (phrase: string) => void;
}

/** What the wrapper answers for one param. */
type WrapperResult =
  | {
      ok: true;
      index: number;
      name: string;
      display?: string;
      /** What a bare number was multiplied by to reach Hz or ms (kHz, s) */
      scale?: number;
    }
  | {
      ok: false;
      kind: string;
      error: string;
      matches?: Array<{ index: number }>;
    }
  | { superseded: number; index: number; name: string };

/** One param entry that was sent on, and where its answer sits in the reply. */
interface SentEntry {
  entry: ParamEntry;
  /** The name or id as the call spelled it */
  key: string;
  byId: boolean;
}

/**
 * Write the `params` of a hosted plug-in's wrapper, in one request. Any other
 * target leaves them to the usual write.
 * @param target - The target
 * @param params - The call's `params`
 * @param stall - What the call has found out about the wrapper so far
 * @param call - The request deadline, and what to tell of a write that may
 *   have landed
 * @returns What each entry came to; undefined when the target isn't a wrapper
 *   or there is nothing to write, so the caller stays sync
 */
export function writeHostedParams(
  target: LiveAPI,
  params: ParamEntry[] | undefined,
  stall: HostedStall,
  call: HostedCall,
): Promise<SettledParams> | undefined {
  if (params == null || params.length === 0 || !isDeviceClass(target.type)) {
    return undefined;
  }

  const hosted = detectHostedPlugin(target);

  return hosted == null
    ? undefined
    : settle(target, hosted, params, stall, call);
}

/**
 * How a wrapper is asked for a value: as text and, when it reads as one, a
 * number in Hz or ms. A number with no unit is flagged `bare`: the wrapper
 * reads it in the unit the param shows (3 is 3 kHz on a param reading
 * "2.50 kHz"), which only it can see.
 * @param written - The value, as written
 * @param key - The param's name or id
 * @returns The value's part of a wrapper entry
 */
export function hostedValueRequest(
  written: string,
  key: string,
): { text: string; number?: number; bare?: true } {
  const text = written.trim();
  const value = normalizeParamValue(text, undefined, key);
  const bare = text !== "" && Number.isFinite(Number(text));

  return {
    text,
    ...(typeof value === "number" && { number: value }),
    ...(bare && { bare }),
  };
}

/**
 * Refuse every entry of a wrapper that won't answer, so none of them falls to
 * the wrapper's own Live params.
 * @param params - The call's `params`
 * @param reason - Why none was written
 * @returns What each entry came to
 */
export function refuseHostedParams(
  params: ParamEntry[],
  reason: string,
): SettledParams {
  const sent = params.map((entry) => ({ entry, ...paramEntryKey(entry) }));

  return refuseAll(new Map(), sent, reason);
}

// --- Helpers below main exports ---

/**
 * Send what can be sent and say what each entry came to.
 * @param target - The wrapper device
 * @param hosted - The plug-in the wrapper hosts
 * @param params - The call's `params`
 * @param stall - What the call has found out about the wrapper so far
 * @param call - The request deadline, and what to tell of a write that may
 *   have landed
 * @returns What each entry came to
 */
async function settle(
  target: LiveAPI,
  hosted: HostedPlugin,
  params: ParamEntry[],
  stall: HostedStall,
  call: HostedCall,
): Promise<SettledParams> {
  const settled: SettledParams = new Map();
  const sent: SentEntry[] = [];

  for (const entry of params) {
    const { key, byId } = paramEntryKey(entry);

    if (byId && parseHostedParamId(key) == null) {
      settled.set(entry, [
        skippedParamById(
          key,
          `not a hosted plug-in's param id (they look like ${hostedParamId(56)})`,
        ),
      ]);
    } else {
      sent.push({ entry, key, byId });
    }
  }

  if (sent.length === 0) {
    return settled;
  }

  const refused =
    noPluginDetail(hosted) ?? stall.reason ?? outOfTime(call.deadline);

  if (refused != null) {
    return refuseAll(settled, sent, refused);
  }

  const reply = await requestPluginHost(
    target.id,
    "write",
    { params: sent.map(wrapperEntry) },
    call.deadline == null ? undefined : call.deadline - Date.now(),
  );

  return reply.success
    ? readReply(target, settled, sent, reply, call)
    : refuseUnanswered(settled, sent, reply, stall, call);
}

/**
 * @param deadline - The request deadline, if any
 * @returns Why nothing may be sent, when the request is out of time
 */
function outOfTime(deadline: number | null | undefined): string | null {
  return deadline != null && deadline - Date.now() <= 0
    ? unreachedDetail("target", "not set")
    : null;
}

/**
 * What the wrapper is asked for one entry: the param and the value.
 * @param item - The entry sent
 * @param item.entry - The entry
 * @param item.key - The name or id as the call spelled it
 * @param item.byId - Whether the call addressed the param by id
 * @returns The wrapper's entry
 */
function wrapperEntry({ entry, key, byId }: SentEntry): object {
  const index = byId ? parseHostedParamId(key) : null;

  return {
    ...(index == null ? { name: key } : { index }),
    ...hostedValueRequest(entry.value, key),
  };
}

/**
 * Turn the wrapper's answers into outcomes, one per entry sent.
 * @param target - The wrapper device
 * @param settled - What is settled so far, added to
 * @param sent - The entries sent, in order
 * @param reply - The wrapper's reply
 * @param call - What to tell of a write that may have landed
 * @returns The settled entries
 */
function readReply(
  target: LiveAPI,
  settled: SettledParams,
  sent: SentEntry[],
  reply: PluginHostResponse,
  call: HostedCall,
): SettledParams {
  const results = (reply.params ?? []) as WrapperResult[];

  if (results.length !== sent.length) {
    return refuseAll(settled, sent, WRAPPER_SILENT);
  }

  if (results.some((result) => "kind" in result && result.kind === "changed")) {
    call.landed("params");
  }

  const outcomes = sent.map((item, i) =>
    outcomeFor(target, item, results[i] as WrapperResult, sent),
  );

  for (const [i, item] of sent.entries()) {
    const result = results[i] as WrapperResult;

    if ("superseded" in result) {
      linkReplacer(outcomes[i] as object, {
        entry: outcomes[result.superseded] as object,
        by: spelled(sent[result.superseded]),
      });
    }

    settled.set(item.entry, [outcomes[i] as ParamOutcome]);
  }

  return settled;
}

/**
 * @param item - An entry sent, if there is one
 * @returns The entry's key as the caller spelled it
 */
function spelled(item: SentEntry | undefined): string {
  return item?.byId ? `id ${item.key}` : `"${item?.key}"`;
}

/**
 * @param target - The wrapper device
 * @param item - The entry sent
 * @param item.entry - The entry
 * @param item.key - The name or id as the call spelled it
 * @param item.byId - Whether the call addressed the param by id
 * @param result - What the wrapper answered for it
 * @param sent - Every entry sent, to name the one that replaces this one
 * @returns The entry's outcome
 */
function outcomeFor(
  target: LiveAPI,
  { entry, key, byId }: SentEntry,
  result: WrapperResult,
  sent: SentEntry[],
): ParamOutcome {
  if ("superseded" in result) {
    return supersededParam(
      key,
      byId,
      namedAgain(spelled(sent[result.superseded])),
    );
  }

  if (result.ok) {
    return landed(entry, result);
  }

  const reason = failureReason(target, result);

  return byId ? skippedParamById(key, reason) : skippedParam(key, reason);
}

/**
 * @param target - The wrapper device
 * @param result - A refusal from the wrapper
 * @returns Why nothing was written, in words the caller could have written
 */
function failureReason(
  target: LiveAPI,
  result: Extract<WrapperResult, { ok: false }>,
): string {
  if (result.kind === "missing") {
    return `not found on ${targetLabel(target)}`;
  }

  if (result.kind === "ambiguous") {
    const ids = (result.matches ?? []).map(({ index }) => hostedParamId(index));

    return `names ${ids.length} params on ${targetLabel(target)} (${ids.join(", ")}), so nothing was written. Send {id, value} to pick one.`;
  }

  // The wrapper threw after moving the param, so it may not be where it was.
  if (result.kind === "changed") {
    return `may have changed: ${result.error}; read the device to check`;
  }

  return `not set: ${result.error}`;
}

/**
 * The outcome for a param that was written: it reports its value unless the
 * bare number asked for landed, and says so when a number landed elsewhere.
 * @param entry - The entry sent
 * @param result - What the wrapper answered
 * @param result.index - The plug-in's number for the param
 * @param result.name - The param's name
 * @param result.display - What the plug-in shows for the value
 * @param result.scale - What the wrapper multiplied a bare number by (kHz, s)
 * @returns The outcome
 */
function landed(
  entry: ParamEntry,
  result: { index: number; name: string; display?: string; scale?: number },
): ParamOutcome {
  const { index } = result;
  const name = result.name.trim();
  const id = hostedParamId(index);
  const shown = (result.display ?? "").trim();
  const asked = entry.value.trim();
  const bare = asked !== "" && Number.isFinite(Number(asked));
  const moved = bare
    ? bareMoved(Number(asked) * (result.scale ?? 1), shown)
    : unitMoved(asked, shown);
  const reported: LandedParam | ParamValueResult =
    bare && !moved
      ? { id, name }
      : {
          id,
          name,
          value: shown,
          ...(moved && { detail: readBackDetail(["value"]) }),
        };

  return { id, name, reported };
}

/**
 * @param requested - The bare number asked for, in the unit compared in
 * @param shown - What the plug-in shows
 * @returns Whether it shows another number, or none
 */
function bareMoved(requested: number, shown: string): boolean {
  return differsAtPublishedResolution(requested, parseLabel(shown).value);
}

/**
 * Whether a number sent with a unit shows as another number. Text, a unit
 * parseLabel doesn't know, a display in another unit or with no number can't
 * be compared, so they count as landed: a false detail is worse than none.
 * @param asked - What was sent, unit and all ("99999 Hz")
 * @param shown - What the plug-in shows ("30000 Hz", "3.00 kHz")
 * @returns Whether it landed on a different number
 */
function unitMoved(asked: string, shown: string): boolean {
  const sent = parseLabel(asked);
  const read = parseLabel(shown);
  const step = displayStep(shown);

  if (
    sent.unit == null ||
    sent.unit !== read.unit ||
    sent.unit === "pan" ||
    typeof sent.value !== "number" ||
    typeof read.value !== "number" ||
    typeof step !== "number"
  ) {
    return false;
  }

  const landedAt = read.value;
  // Within half the display's last digit (plus float noise) shows as what
  // landed: "3.00 kHz" is anything from 2995 to 3005 Hz.
  const half = step / 2 + step * 1e-9;
  const asShown = (value: number): number =>
    Math.abs(value - landedAt) <= half ? landedAt : value;

  return differsAtPublishedResolution(sent.value, landedAt, asShown);
}

/**
 * The display's last digit, in the unit compared in: 10 for "3.00 kHz", 0.1
 * for "-6.0 dB".
 * @param shown - What the plug-in shows
 * @returns The step, or null for a display that doesn't start with a number
 */
function displayStep(shown: string): ParsedLabel["value"] {
  const number = /^[+-]?\d+(?:\.(\d+))?/.exec(shown);

  if (number == null) {
    return null;
  }

  const decimals = number[1]?.length ?? 0;
  const digit = decimals === 0 ? "1" : `0.${"1".padStart(decimals, "0")}`;

  return parseLabel(digit + shown.slice(number[0].length)).value;
}

/**
 * The wrapper never answered, or answered with an error, or the request was too
 * large to send. A timeout may have come after the write, so it says so and
 * stops later targets trying.
 * @param settled - What is settled so far, added to
 * @param sent - The entries sent
 * @param reply - The failed reply
 * @param stall - Set when the wrapper didn't answer
 * @param call - What to tell of a write that may have landed
 * @returns The settled entries
 */
function refuseUnanswered(
  settled: SettledParams,
  sent: SentEntry[],
  reply: PluginHostResponse,
  stall: HostedStall,
  call: HostedCall,
): SettledParams {
  // Never sent, so nothing changed and later targets can still be tried.
  if (reply.tooLarge) {
    return refuseAll(
      settled,
      sent,
      "not set: too large for one call; split the params across calls",
    );
  }

  if (reply.error?.startsWith(NO_ANSWER)) {
    call.landed("params");
    stall.reason =
      "not set: the hosted plug-in didn't answer an earlier device's write; re-run for this target";

    return refuseAll(
      settled,
      sent,
      "may have changed: the hosted plug-in didn't answer; read the device to check",
    );
  }

  // A wrapper from before this op existed doesn't know it.
  const outdated = reply.error?.startsWith("unknown op") === true;

  return refuseAll(
    settled,
    sent,
    outdated
      ? "not set: this wrapper is out of date; create the hosted plug-in again"
      : `not set: ${reply.error ?? "write failed"}`,
  );
}

/**
 * Give every entry sent the same refusal.
 * @param settled - What is settled so far, added to
 * @param sent - The entries sent
 * @param reason - Why none was written
 * @returns The settled entries
 */
function refuseAll(
  settled: SettledParams,
  sent: SentEntry[],
  reason: string,
): SettledParams {
  for (const { entry, key, byId } of sent) {
    settled.set(entry, [
      byId ? skippedParamById(key, reason) : skippedParam(key, reason),
    ]);
  }

  return settled;
}
