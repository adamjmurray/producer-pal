// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Writing the `envelopes` param. Runs last in a clip's update, on the clip the
// rest of it settled on: a move re-creates the clip, and the meter the times
// are spelled in is the one the same call may just have written.

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { type EnvelopeLine } from "./envelope-lines.ts";
import { applyArrangementEnvelopes } from "./arrangement/apply-arrangement-envelopes.ts";
import {
  canWriteEnvelopePoints,
  writeEachLine,
} from "./write-envelope-lines.ts";

/**
 * Write one clip's automation, reporting what landed on its own entry. A
 * session clip holds the envelopes itself. An arrangement clip's go to the
 * track's lane, which re-creates the clip: its entry then carries the new id.
 *
 * Nothing here throws: a line the remote script turned down becomes a detail on
 * the entry, and the lines after it still run.
 * @param entry - The clip's result entry, written to
 * @param lines - The `envelopes` param, already read into lines
 * @param context - The call's deadline, arrangement lane view and silence file
 */
export async function applyClipEnvelopes(
  entry: ClipResult | undefined,
  lines: readonly EnvelopeLine[] | undefined,
  context: Pick<ToolContext, "deadline" | "lanes" | "silenceWavPath"> = {},
): Promise<void> {
  if (entry == null || lines == null) {
    return;
  }

  const clip = LiveAPI.from(entry.id);

  if ((clip.getProperty("is_arrangement_clip") as number) > 0) {
    await applyArrangementEnvelopes(entry, lines, context);

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
      canWritePoints: canWriteEnvelopePoints(),
    },
    context.deadline,
  );
}
