// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Writing the `envelopes` param, one round trip to the remote script per line.
// Runs last in a clip's update, on the clip the rest of it settled on: a move
// re-creates the clip, and the meter the times are spelled in is the one the
// same call may just have written.

import { parseEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";
import {
  ARRANGEMENT_CLIP_NOTE,
  envelopeRoute,
  REMOTE_SCRIPT_MISSING,
  type RouteOutcome,
} from "./envelope-route.ts";
import { envelopeTarget } from "./envelope-targets.ts";
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
}

/**
 * Write one clip's automation, reporting what landed on its own entry.
 *
 * Nothing here throws: a line the remote script turned down becomes a reason on
 * the entry, and the lines after it still run.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 */
export async function applyClipEnvelopes(
  entry: ClipResult | undefined,
  lines: readonly EnvelopeLine[] | undefined,
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

  await writeEachLine(entry, lines, {
    trackIndex,
    slot,
    timeSigNumerator: clip.getProperty("signature_numerator") as number,
    timeSigDenominator: clip.getProperty("signature_denominator") as number,
  });
}

// --- Helpers below main exports ---

/**
 * Write the lines one at a time, stopping only when the remote script turns out
 * not to be there at all.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param address - The clip the lines write to, and its meter
 */
async function writeEachLine(
  entry: ClipResult,
  lines: readonly EnvelopeLine[],
  address: ClipAddress,
): Promise<void> {
  let written = 0;

  for (const line of lines) {
    const outcome = await writeOneLine(line, address);

    if (outcome.ok) {
      written += 1;
      continue;
    }

    if (!outcome.available) {
      entry.envelopes = REMOTE_SCRIPT_MISSING;

      return;
    }

    appendReason(entry, `envelope "${line.target}": ${outcome.reason}`);
  }

  entry.envelopes = written;
}

/**
 * Write or clear one parameter's envelope.
 * @param line - The line to apply
 * @param address - The clip it writes to, and its meter
 * @returns Whether it landed, and why it didn't when it didn't
 */
async function writeOneLine(
  line: EnvelopeLine,
  address: ClipAddress,
): Promise<RouteOutcome<unknown>> {
  const { trackIndex, slot } = address;
  let request;

  try {
    request = {
      track: `t${String(trackIndex)}`,
      slot,
      ...envelopeTarget(line.target, trackIndex),
    };
  } catch (error) {
    return { ok: false, reason: errorMessage(error), available: true };
  }

  if (line.notation === "") {
    return await envelopeRoute<EnvelopeClearResult>(
      ENVELOPE_ROUTES.clear,
      request,
    );
  }

  return await envelopeRoute<EnvelopeWriteResult>(ENVELOPE_ROUTES.write, {
    ...request,
    points: parseEnvelopeNotation(line.notation, address).map((point) => ({
      time: point.time,
      value: point.value,
      ...(point.jump && { jump: true }),
    })),
  });
}
