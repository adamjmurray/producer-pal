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
import { parseLabel } from "#src/tools/shared/device/helpers/params/param-label-parsing.ts";
import {
  detectHostedPlugin,
  hostedParamId,
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

/** What the write needs from the call. */
interface HostedCall {
  deadline: number | null | undefined;
  /** Told that a write may have changed Live, for a later throw to say so */
  landed: (phrase: string) => void;
}

/** What the wrapper answers for one param. */
type WrapperResult =
  | { ok: true; index: number; name: string; display?: string }
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
  if (
    params == null ||
    params.length === 0 ||
    !isDeviceClass(target.type) ||
    detectHostedPlugin(target) == null
  ) {
    return undefined;
  }

  return settle(target, params, stall, call);
}

// --- Helpers below main exports ---

/**
 * Send what can be sent and say what each entry came to.
 * @param target - The wrapper device
 * @param params - The call's `params`
 * @param stall - What the call has found out about the wrapper so far
 * @param call - The request deadline, and what to tell of a write that may
 *   have landed
 * @returns What each entry came to
 */
async function settle(
  target: LiveAPI,
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

  const refused = stall.reason ?? outOfTime(call.deadline);

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
    ? readReply(target, settled, sent, reply)
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
 * What the wrapper is asked for one entry: the param, and the value as text and,
 * when it reads as one, a number.
 * @param item - The entry sent
 * @param item.entry - The entry
 * @param item.key - The name or id as the call spelled it
 * @param item.byId - Whether the call addressed the param by id
 * @returns The wrapper's entry
 */
function wrapperEntry({ entry, key, byId }: SentEntry): object {
  const text = entry.value.trim();
  const value = normalizeParamValue(text, undefined, key);
  const index = byId ? parseHostedParamId(key) : null;

  return {
    ...(index == null ? { name: key } : { index }),
    text,
    ...(typeof value === "number" && { number: value }),
  };
}

/**
 * Turn the wrapper's answers into outcomes, one per entry sent.
 * @param target - The wrapper device
 * @param settled - What is settled so far, added to
 * @param sent - The entries sent, in order
 * @param reply - The wrapper's reply
 * @returns The settled entries
 */
function readReply(
  target: LiveAPI,
  settled: SettledParams,
  sent: SentEntry[],
  reply: PluginHostResponse,
): SettledParams {
  const results = (reply.params ?? []) as WrapperResult[];

  if (results.length !== sent.length) {
    return refuseAll(
      settled,
      sent,
      "not set: the hosted plug-in didn't answer",
    );
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

  return `not set: ${result.error}`;
}

/**
 * The outcome for a param that was written: it reports its value only when that
 * isn't the bare number asked for.
 * @param entry - The entry sent
 * @param result - What the wrapper answered
 * @param result.index - The plug-in's number for the param
 * @param result.name - The param's name
 * @param result.display - What the plug-in shows for the value
 * @returns The outcome
 */
function landed(
  entry: ParamEntry,
  result: { index: number; name: string; display?: string },
): ParamOutcome {
  const { index } = result;
  const name = result.name.trim();
  const id = hostedParamId(index);
  const shown = (result.display ?? "").trim();
  const asked = entry.value.trim();
  const requested =
    asked !== "" && Number.isFinite(Number(asked)) ? Number(asked) : null;
  const read = parseLabel(shown).value;
  const same =
    requested != null &&
    typeof read === "number" &&
    !differsAtPublishedResolution(requested, read);
  const reported: LandedParam | ParamValueResult = same
    ? { id, name }
    : {
        id,
        name,
        value: shown,
        ...(requested == null ? {} : { detail: readBackDetail(["value"]) }),
      };

  return { id, name, reported };
}

/**
 * The wrapper never answered, or answered with an error. A timeout may have come
 * after the write, so it says so and stops later targets trying.
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
