// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reading a clip's envelopes back, and turning the model's tool calls into
 * facts about what landed, for the automation scenarios.
 *
 * All of them use the Lead clip of basic-with-drum-and-lead-clips: 2 bars of
 * 4/4 on t3, scene 1.
 */

import {
  getAllToolCalls,
  parsedToolResult,
  toolCallFailed,
} from "../../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalTurnResult,
  type ToolCall,
} from "../../../../types.ts";

export const TOOL_READ_CLIP = "ppal-read-clip";
export const TOOL_UPDATE_CLIP = "ppal-update-clip";
export const TOOL_DUPLICATE = "ppal-duplicate";
export const TOOL_CREATE_CLIP = "ppal-create-clip";

/** The Lead clip: session slot, and its track's index. */
export const LEAD_CLIP = "t3/s0";
export const LEAD_TRACK_INDEX = 3;

/** One automated parameter, as ppal-read-clip's `envelopes` reports it. */
export interface ClipEnvelopeRead {
  /** Live's own name for the parameter. */
  parameter: string;
  /** Set for a device parameter, e.g. "t3/d3"; absent for a mixer one. */
  device?: string;
  eventCount: number;
  /** Notation like "1|1 0.4 (display) ~ 2|1 0.85 (display)". */
  events?: string;
}

/**
 * The Lead clip's envelopes, read back after the turns. `check` names what is
 * wrong, or returns null when all is well.
 *
 * @param check - Judges the envelopes the clip reports
 * @returns A state assertion over the Lead clip's automation
 */
export function assertLeadEnvelopes(
  check: (envelopes: ClipEnvelopeRead[]) => string | null,
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path: LEAD_CLIP, include: ["envelopes"] },
    expect: (result) => check(envelopesOf(result)) == null,
    explain: (result) => check(envelopesOf(result)) ?? "",
  };
}

/**
 * The envelopes of a read-clip result. A read that couldn't reach them (no
 * remote script) reports prose instead, which counts as none.
 *
 * @param result - Parsed ppal-read-clip result
 * @returns The envelope entries, or an empty list
 */
export function envelopesOf(result: unknown): ClipEnvelopeRead[] {
  const envelopes = (result as { envelopes?: unknown } | null)?.envelopes;

  return Array.isArray(envelopes) ? (envelopes as ClipEnvelopeRead[]) : [];
}

/**
 * The raw point values of an envelope's notation, in time order. Live's display
 * text in parentheses is dropped first, since it may hold numbers too.
 *
 * @param events - An envelope's `events` notation
 * @returns One value per point
 */
export function envelopeValues(events: string | undefined): number[] {
  return (events ?? "")
    .replaceAll(/\([^()]*\)/g, "")
    .split(/\s*[~>]\s*/)
    .map((point) => Number(point.trim().split(/\s+/)[1]))
    .filter((value) => !Number.isNaN(value));
}

/**
 * Whether an envelope's value is lower at its end than at its start.
 *
 * @param envelope - The envelope to check
 * @returns True when the first point is below the last
 */
export function risesOverTime(envelope: ClipEnvelopeRead): boolean {
  const values = envelopeValues(envelope.events);

  const first = values[0];
  const last = values.at(-1);

  return values.length >= 2 && first != null && last != null && first < last;
}

/**
 * Split the clip's envelopes into volume, pan and the rest of the mixer (the
 * sends), and the device parameters. Live's names for the mixer parameters
 * aren't ours to predict, so a send is any mixer envelope that isn't volume or
 * pan.
 *
 * @param envelopes - The envelopes a clip reports
 * @returns The envelopes by kind
 */
export function sortEnvelopes(envelopes: ClipEnvelopeRead[]): {
  volume: ClipEnvelopeRead[];
  pan: ClipEnvelopeRead[];
  sends: ClipEnvelopeRead[];
  devices: ClipEnvelopeRead[];
} {
  const mixer = envelopes.filter((envelope) => envelope.device == null);
  const volume = mixer.filter((envelope) => /vol/i.test(envelope.parameter));
  const pan = mixer.filter((envelope) => /pan/i.test(envelope.parameter));

  return {
    volume,
    pan,
    sends: mixer.filter(
      (envelope) => !volume.includes(envelope) && !pan.includes(envelope),
    ),
    devices: envelopes.filter((envelope) => envelope.device != null),
  };
}

/**
 * Every ppal-update-clip call whose `envelopes` landed on at least one line,
 * in call order. Failed attempts don't count, and neither does a call that
 * only got the arrangement-clip note back (its `envelopes` is prose).
 *
 * @param turns - All conversation turns
 * @returns The calls that wrote automation
 */
export function envelopeWrites(turns: EvalTurnResult[]): ToolCall[] {
  return getAllToolCalls(turns).filter(
    (call) =>
      call.name === TOOL_UPDATE_CLIP &&
      typeof call.args.envelopes === "string" &&
      resultEntries(call).some(
        (entry) => typeof entry.envelopes === "number" && entry.envelopes > 0,
      ),
  );
}

/**
 * Whether a call put a clip on the arrangement: a duplicate or create with a
 * `[position]` destination.
 *
 * @param call - A tool call
 * @returns True for a successful call that names an arrangement spot
 */
export function placesOnArrangement(call: ToolCall): boolean {
  const destination =
    call.name === TOOL_DUPLICATE
      ? call.args.toPath
      : call.name === TOOL_CREATE_CLIP
        ? call.args.path
        : undefined;

  return (
    typeof destination === "string" &&
    destination.includes("[") &&
    !toolCallFailed(call)
  );
}

/**
 * The entries of a write call's result, one or many.
 *
 * @param call - A tool call
 * @returns The result entries, empty when it has none
 */
function resultEntries(call: ToolCall): Array<Record<string, unknown>> {
  const result = parsedToolResult(call) as unknown;

  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }

  return result == null ? [] : [result as Record<string, unknown>];
}
