// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Writing the `envelopes` lines to one clip, one round trip to the remote
// script per line. The clip is a session clip, or the scratch clip an
// arrangement clip's lane is stamped from.

import { parseEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { MAX_SINGLE_MESSAGE_BYTES } from "#src/shared/mcp-responses.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";
import { hostedSlots, type HostedSlots } from "./hosted/hosted-slots.ts";
import { envelopeWritePoints } from "./envelope-write-points.ts";
import { envelopeChange, type RouteOutcome } from "./envelope-route.ts";
import {
  findSameParameter,
  resolveEnvelopeLines,
  type ResolvedEnvelopeLine,
} from "./envelope-targets.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeClearResult,
  type EnvelopeWritePoint,
  type EnvelopeWriteResult,
} from "./remote-script-envelope-contract.ts";

/** The clip the lines write to, and the meter their times are spelled in. */
export interface ClipAddress {
  trackIndex: number;
  slot: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
  /** Where the clip stops playing, in beats; Live keeps events past it */
  endBeats: number;
  /** An audio clip with warping off: Live keeps its envelopes but never plays them */
  unwarped: boolean;
  /** Live before 12.4 has no `Envelope.create_event`, so points can't be written */
  canWritePoints: boolean;
  /**
   * The clip is a scratch one, copied onto an arrangement clip's span to write
   * the track's lane. A lane can't be cleared, so an empty line is refused.
   */
  carrier?: boolean;
}

/** Why points aren't written to an unwarped audio clip. */
const UNWARPED_CLIP_REFUSAL =
  "not written: an unwarped audio clip can't play envelopes. Set warping: true on the clip, then write it again";

/** The oldest Live whose Python API can write envelope points. */
const WRITE_POINTS_MIN_VERSION = "12.4";

/** Why points aren't written on an older Live. */
const OLD_LIVE_REFUSAL = `not written: writing envelope points requires Live ${WRITE_POINTS_MIN_VERSION} or later. An empty line still clears an envelope`;

/** Why an empty line does nothing to an arrangement clip. */
const LANE_CLEAR_REFUSAL =
  "not cleared: an arrangement lane can't be cleared; write a flat line instead";

/** What a clear says when the parameter had no envelope. */
const NOTHING_TO_CLEAR = "there was no envelope to clear";

/** The user had moved the parameter, which mutes its automation until re-enabled. */
const REENABLED_NOTE = "re-enabled its automation, which was overridden";

/**
 * Whether this Live can write envelope points.
 * @returns True on 12.4 or later
 */
export function canWriteEnvelopePoints(): boolean {
  return liveVersionAtLeast(WRITE_POINTS_MIN_VERSION);
}

/**
 * Write the lines one at a time, stopping when the remote script turns out not
 * to be there, or when it stops answering or the request runs out of time: the
 * next line would stall the same way. A script missing before any line landed
 * is the entry's `envelopes`; after one did, a detail naming the lines left.
 * Nothing here throws: a line the remote script turned down becomes a detail
 * on the entry, and the lines after it still run.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param address - The clip the lines write to, and its meter
 * @param deadline - The request deadline, if any
 * @param manage - Whether the caller can use ppal-manage
 * @returns How many lines were written
 */
export async function writeEachLine(
  entry: ClipResult,
  lines: readonly EnvelopeLine[],
  address: ClipAddress,
  deadline: number | null | undefined,
  manage: boolean,
): Promise<number> {
  const resolved = resolveEnvelopeLines(lines, address.trackIndex);
  const clash = findSameParameter(resolved);

  // Each line replaces its parameter's whole envelope, so two on one parameter
  // can't both stand. Refused, as two lines naming the same text are.
  if (clash != null) {
    entry.envelopes = `not written: "${clash[0].target}" and "${clash[1].target}" are the same parameter; give one line per parameter, since each replaces that parameter's whole envelope`;

    return 0;
  }

  let written = 0;
  const slots = hostedSlots({
    trackIndex: address.trackIndex,
    deadline,
    manage,
  });

  for (const [index, line] of lines.entries()) {
    const outcome = await writeOneLine(
      resolved[index] as ResolvedEnvelopeLine,
      address,
      { deadline, manage, slots },
    );

    if (outcome.ok) {
      written += 1;

      if (outcome.note != null) {
        appendDetail(entry, `envelope "${line.target}": ${outcome.note}`);
      }

      continue;
    }

    if (!outcome.available) {
      // Nothing was sent for this line. With none written, the reason is the answer.
      if (written === 0) {
        entry.envelopes = outcome.reason;

        return 0;
      }

      appendDetail(
        entry,
        `${outcome.reason}; envelopes not written, re-run for ${named(lines.slice(index))}`,
      );
      break;
    }

    if (outcome.stalled != null) {
      reportStalled(entry, outcome, line, lines.slice(index + 1), {
        address,
        written,
      });
      break;
    }

    appendDetail(entry, `envelope "${line.target}": ${outcome.reason}`);
  }

  entry.envelopes = written;

  return written;
}

// --- Helpers below main exports ---

/**
 * Say where a stalled write stopped, and which lines it left alone.
 * @param entry - The clip's result entry, written to
 * @param outcome - The failed route call
 * @param line - The line that stalled
 * @param rest - The lines after it, none of them sent
 * @param progress - The clip the lines write to, and how many were written
 * @param progress.address - The clip the lines write to
 * @param progress.written - How many lines were written before this one
 */
function reportStalled(
  entry: ClipResult,
  outcome: Extract<RouteOutcome<unknown>, { ok: false }>,
  line: EnvelopeLine,
  rest: readonly EnvelopeLine[],
  { address, written }: { address: ClipAddress; written: number },
): void {
  if (outcome.stalled === "out-of-time") {
    appendDetail(
      entry,
      `${outcome.reason}; envelopes not written, re-run for ${named([line, ...rest])}`,
    );

    return;
  }

  const mayHave = stalledOutcome(line, address, written);
  const said = `envelope "${line.target}": ${outcome.reason}`;

  appendDetail(entry, mayHave == null ? said : `${said}; ${mayHave}`);

  if (rest.length > 0) {
    appendDetail(
      entry,
      `envelopes not written, since the next would wait the same way: ${named(rest)}`,
    );
  }
}

/**
 * What a stalled line may have done.
 * @param line - The line that stalled
 * @param address - The clip the lines write to
 * @param written - How many lines were written before it
 * @returns The words for the entry, or undefined when it can't have done anything
 */
function stalledOutcome(
  line: EnvelopeLine,
  address: ClipAddress,
  written: number,
): string | undefined {
  if (address.carrier === true) {
    // With nothing written, the lane is never stamped.
    return written === 0
      ? undefined
      : "its points may or may not be in the lane";
  }

  return line.notation === ""
    ? "it may still have been cleared"
    : "its points may still have landed";
}

/**
 * Quote each line's target, for a detail.
 * @param lines - The lines to name
 * @returns The targets, comma-separated
 */
function named(lines: readonly EnvelopeLine[]): string {
  return lines.map(({ target }) => `"${target}"`).join(", ");
}

/** What one line's write needs from the call. */
interface LineCall {
  deadline: number | null | undefined;
  manage: boolean;
  /** Finds or makes the slots hosted params are automated through */
  slots: HostedSlots;
}

/**
 * Write or clear one parameter's envelope.
 * @param resolved - The line to apply, with the parameter it reaches
 * @param address - The clip it writes to, and its meter
 * @param call - The deadline, who is calling, and the hosted slots
 * @returns Whether it landed, and why it didn't when it didn't
 */
async function writeOneLine(
  resolved: ResolvedEnvelopeLine,
  address: ClipAddress,
  call: LineCall,
): Promise<RouteOutcome<unknown> & { note?: string }> {
  if ("error" in resolved) {
    return { ok: false, reason: resolved.error, available: true };
  }

  const { line } = resolved;
  // Refuse and parse before placing: placing a hosted param maps a slot, which
  // changes the Set, so it waits until the line is sure to be written.
  const refusal = refusalFor(line, address);

  if (refusal != null) {
    return { ok: false, reason: refusal, available: true };
  }

  let points;

  try {
    // The up-front check read only the syntax; times need this clip's meter.
    points =
      line.notation === ""
        ? undefined
        : parseEnvelopeNotation(line.notation, address);
  } catch (error) {
    return { ok: false, reason: errorMessage(error), available: true };
  }

  // A clear only looks for the slot a hosted param has; it never makes one.
  const placed =
    "hosted" in resolved
      ? await call.slots.place(resolved.hosted, points == null)
      : { ok: true as const, target: resolved.target };

  if (!placed.ok) {
    return { ok: false, reason: placed.reason, available: true };
  }

  // A hosted param with no slot has no envelope to clear.
  if (placed.target == null) {
    return {
      ok: true,
      result: { cleared: false },
      note: NOTHING_TO_CLEAR,
    };
  }

  const request = {
    track: `t${String(address.trackIndex)}`,
    slot: address.slot,
    ...placed.target,
  };
  const outcome =
    points == null
      ? await clearEnvelope(request, call)
      : await writeEnvelope(request, { points, address }, call);

  return placed.mapped == null ? outcome : afterMapping(outcome, placed.mapped);
}

/**
 * Why a line can't be written on this clip, before anything is touched.
 * @param line - The line
 * @param address - The clip it writes to
 * @returns The reason, or undefined when it can be written
 */
function refusalFor(
  line: EnvelopeLine,
  address: ClipAddress,
): string | undefined {
  if (line.notation === "") {
    return address.carrier === true ? LANE_CLEAR_REFUSAL : undefined;
  }

  // A clear still runs on an unwarped clip: removing an envelope that can't
  // play does no harm.
  if (address.unwarped) {
    return UNWARPED_CLIP_REFUSAL;
  }

  return address.canWritePoints ? undefined : OLD_LIVE_REFUSAL;
}

/**
 * Say that a hosted param was mapped to a slot on the way to its line, whether
 * the line then landed or not.
 * @param outcome - What the line came to
 * @param mapped - What was mapped
 * @returns The outcome, saying so
 */
function afterMapping(
  outcome: RouteOutcome<unknown> & { note?: string },
  mapped: string,
): RouteOutcome<unknown> & { note?: string } {
  return outcome.ok
    ? { ...outcome, note: joinDetails([mapped, outcome.note]) }
    : { ...outcome, reason: `${outcome.reason}; already changed: ${mapped}` };
}

/**
 * Clear one parameter's envelope.
 * @param request - Which clip and parameter
 * @param call - The deadline and who is calling
 * @returns Whether it was cleared
 */
async function clearEnvelope(
  request: object,
  call: LineCall,
): Promise<RouteOutcome<unknown> & { note?: string }> {
  const cleared = await envelopeChange<EnvelopeClearResult>(
    ENVELOPE_ROUTES.clear,
    request,
    call.deadline,
    call.manage,
  );

  return cleared.ok && !cleared.result.cleared
    ? { ...cleared, note: NOTHING_TO_CLEAR }
    : cleared;
}

/**
 * Write one parameter's envelope.
 * @param request - Which clip and parameter
 * @param what - The points, and the clip they are spelled for
 * @param what.points - The parsed points
 * @param what.address - The clip it writes to, and its meter
 * @param call - The deadline and who is calling
 * @returns Whether it was written
 */
async function writeEnvelope(
  request: object,
  what: {
    points: ReturnType<typeof parseEnvelopeNotation>;
    address: ClipAddress;
  },
  call: LineCall,
): Promise<RouteOutcome<unknown> & { note?: string }> {
  const { points, address } = what;
  const writePoints = envelopeWritePoints(points);
  const outcome = await envelopeChange<EnvelopeWriteResult>(
    ENVELOPE_ROUTES.write,
    { ...request, points: writePoints },
    call.deadline,
    call.manage,
  );

  if (!outcome.ok && outcome.tooLarge === true) {
    return { ...outcome, reason: tooManyPoints(request, writePoints) };
  }

  return outcome.ok
    ? {
        ...outcome,
        note: joinDetails([
          outcome.result.re_enabled ? REENABLED_NOTE : undefined,
          pastEndNote(points, address),
        ]),
      }
    : outcome;
}

/**
 * Why a line too large for one Max message wasn't sent.
 * @param request - The rest of what the write sends
 * @param points - The points that didn't fit
 * @returns The reason, with a rough count of how many would fit
 */
function tooManyPoints(
  request: object,
  points: readonly EnvelopeWritePoint[],
): string {
  // Room left once the route, the clip and the longest expiry are in.
  const room =
    MAX_SINGLE_MESSAGE_BYTES -
    JSON.stringify({
      route: ENVELOPE_ROUTES.write,
      args: { ...request, points: [], expiresInMs: Number.MAX_SAFE_INTEGER },
    }).length;
  const fit = Math.min(
    points.length - 1,
    Math.floor((points.length * room) / JSON.stringify(points).length),
  );

  return `not written: ${points.length} points are too many to send in one write (about ${fit} fit)`;
}

/**
 * Live stores a point past the clip's end but never plays it, which is almost
 * always a wrong bar number rather than what was meant.
 * @param points - What was written
 * @param address - The clip and its meter
 * @returns The note, or undefined when every point is inside the clip
 */
function pastEndNote(
  points: readonly { time: number }[],
  address: ClipAddress,
): string | undefined {
  const past = points.find((point) => point.time > address.endBeats);

  if (past == null) {
    return undefined;
  }

  const spell = (beats: number) =>
    abletonBeatsToBarBeat(
      beats,
      address.timeSigNumerator,
      address.timeSigDenominator,
    );

  return `point ${spell(past.time)} is past the clip end (${spell(address.endBeats)}), so it never plays`;
}
