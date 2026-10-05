// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Writing the `envelopes` param, one round trip to the remote script per line.
// Runs last in a clip's update, on the clip the rest of it settled on: a move
// re-creates the clip, and the meter the times are spelled in is the one the
// same call may just have written.

import { parseEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  appendDetail,
  joinDetails,
} from "#src/tools/shared/helpers/entry-details.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";
import { envelopeWritePoints } from "./envelope-write-points.ts";
import {
  ARRANGEMENT_CLIP_NOTE,
  envelopeRoute,
  REMOTE_SCRIPT_MISSING,
  type RouteOutcome,
} from "./envelope-route.ts";
import {
  findSameParameter,
  resolveEnvelopeLines,
  type ResolvedEnvelopeLine,
} from "./envelope-targets.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeClearResult,
  type EnvelopeWriteResult,
} from "./remote-script-envelope-contract.ts";

/** The clip the lines write to, and the meter their times are spelled in. */
interface ClipAddress {
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
}

/** Why points aren't written to an unwarped audio clip. */
const UNWARPED_CLIP_REFUSAL =
  "not written: an unwarped audio clip can't play envelopes. Set warping: true on the clip, then write it again";

/** The oldest Live whose Python API can write envelope points. */
const WRITE_POINTS_MIN_VERSION = "12.4";

/** Why points aren't written on an older Live. */
const OLD_LIVE_REFUSAL = `not written: writing envelope points requires Live ${WRITE_POINTS_MIN_VERSION} or later. An empty line still clears an envelope`;

/** The user had moved the parameter, which mutes its automation until re-enabled. */
const REENABLED_NOTE = "re-enabled its automation, which was overridden";

/**
 * Write one clip's automation, reporting what landed on its own entry.
 *
 * Nothing here throws: a line the remote script turned down becomes a detail on
 * the entry, and the lines after it still run.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param deadline - The request deadline from ToolContext, if any
 */
export async function applyClipEnvelopes(
  entry: ClipResult | undefined,
  lines: readonly EnvelopeLine[] | undefined,
  deadline?: number | null,
): Promise<void> {
  if (entry == null || lines == null) {
    return;
  }

  const clip = LiveAPI.from(entry.id);

  if ((clip.getProperty("is_arrangement_clip") as number) > 0) {
    entry.envelopes = ARRANGEMENT_CLIP_NOTE;

    return;
  }

  const trackIndex = clip.trackIndex;
  const slot = clip.clipSlotIndex;

  if (trackIndex == null || slot == null) {
    entry.envelopes = "only a clip in a session clip slot can hold automation";

    return;
  }

  await writeEachLine(
    entry,
    lines,
    {
      trackIndex,
      slot,
      timeSigNumerator: clip.getProperty("signature_numerator") as number,
      timeSigDenominator: clip.getProperty("signature_denominator") as number,
      endBeats: Math.max(
        clip.getProperty("loop_end") as number,
        clip.getProperty("end_marker") as number,
      ),
      // Read here, last: the same call may just have changed warping.
      unwarped:
        (clip.getProperty("is_audio_clip") as number) > 0 &&
        (clip.getProperty("warping") as number) === 0,
      canWritePoints: !isNewerVersion(
        String(LiveAPI.from("live_app").call("get_version_string")),
        WRITE_POINTS_MIN_VERSION,
      ),
    },
    deadline,
  );
}

// --- Helpers below main exports ---

/**
 * Write the lines one at a time, stopping when the remote script turns out not
 * to be there, or when it stops answering or the request runs out of time: the
 * next line would stall the same way.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param address - The clip the lines write to, and its meter
 * @param deadline - The request deadline, if any
 */
async function writeEachLine(
  entry: ClipResult,
  lines: readonly EnvelopeLine[],
  address: ClipAddress,
  deadline: number | null | undefined,
): Promise<void> {
  const resolved = resolveEnvelopeLines(lines, address.trackIndex);
  const clash = findSameParameter(resolved);

  // Each line replaces its parameter's whole envelope, so two on one parameter
  // can't both stand. Refused, as two lines naming the same text are.
  if (clash != null) {
    entry.envelopes = `not written: "${clash[0].target}" and "${clash[1].target}" are the same parameter; give one line per parameter, since each replaces that parameter's whole envelope`;

    return;
  }

  let written = 0;

  for (const [index, line] of lines.entries()) {
    const outcome = await writeOneLine(
      resolved[index] as ResolvedEnvelopeLine,
      address,
      deadline,
    );

    if (outcome.ok) {
      written += 1;

      if (outcome.note != null) {
        appendDetail(entry, `envelope "${line.target}": ${outcome.note}`);
      }

      continue;
    }

    if (!outcome.available) {
      entry.envelopes = REMOTE_SCRIPT_MISSING;

      return;
    }

    if (outcome.stalled != null) {
      reportStalled(entry, outcome, line, lines.slice(index + 1));
      break;
    }

    appendDetail(entry, `envelope "${line.target}": ${outcome.reason}`);
  }

  entry.envelopes = written;
}

/**
 * Say where a stalled write stopped, and which lines it left alone.
 * @param entry - The clip's result entry, written to
 * @param outcome - The failed route call
 * @param line - The line that stalled
 * @param rest - The lines after it, none of them sent
 */
function reportStalled(
  entry: ClipResult,
  outcome: Extract<RouteOutcome<unknown>, { ok: false }>,
  line: EnvelopeLine,
  rest: readonly EnvelopeLine[],
): void {
  if (outcome.stalled === "out-of-time") {
    appendDetail(
      entry,
      `${outcome.reason}; envelopes not written, re-run for ${named([line, ...rest])}`,
    );

    return;
  }

  appendDetail(
    entry,
    `envelope "${line.target}": ${outcome.reason}; ${line.notation === "" ? "it may still have been cleared" : "its points may still have landed"}`,
  );

  if (rest.length > 0) {
    appendDetail(
      entry,
      `envelopes not written, since the next would wait the same way: ${named(rest)}`,
    );
  }
}

/**
 * Quote each line's target, for a detail.
 * @param lines - The lines to name
 * @returns The targets, comma-separated
 */
function named(lines: readonly EnvelopeLine[]): string {
  return lines.map(({ target }) => `"${target}"`).join(", ");
}

/**
 * Write or clear one parameter's envelope.
 * @param resolved - The line to apply, with the parameter it reaches
 * @param address - The clip it writes to, and its meter
 * @param deadline - The request deadline, if any
 * @returns Whether it landed, and why it didn't when it didn't
 */
async function writeOneLine(
  resolved: ResolvedEnvelopeLine,
  address: ClipAddress,
  deadline: number | null | undefined,
): Promise<RouteOutcome<unknown> & { note?: string }> {
  if ("error" in resolved) {
    return { ok: false, reason: resolved.error, available: true };
  }

  const { line, target } = resolved;
  const request = {
    track: `t${String(address.trackIndex)}`,
    slot: address.slot,
    ...target,
  };

  // A clear still runs: removing an envelope that can't play does no harm.
  if (line.notation !== "" && address.unwarped) {
    return { ok: false, reason: UNWARPED_CLIP_REFUSAL, available: true };
  }

  if (line.notation !== "" && !address.canWritePoints) {
    return { ok: false, reason: OLD_LIVE_REFUSAL, available: true };
  }

  if (line.notation === "") {
    const cleared = await envelopeRoute<EnvelopeClearResult>(
      ENVELOPE_ROUTES.clear,
      request,
      deadline,
    );

    return cleared.ok && !cleared.result.cleared
      ? { ...cleared, note: "there was no envelope to clear" }
      : cleared;
  }

  let points;

  try {
    // The up-front check parsed in 4/4; this clip's meter can still refuse it.
    points = parseEnvelopeNotation(line.notation, address);
  } catch (error) {
    return { ok: false, reason: errorMessage(error), available: true };
  }

  const outcome = await envelopeRoute<EnvelopeWriteResult>(
    ENVELOPE_ROUTES.write,
    {
      ...request,
      points: envelopeWritePoints(points),
    },
    deadline,
  );

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
