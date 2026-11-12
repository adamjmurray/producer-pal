// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A session clip moved to another track's slot loses its device envelopes. A
// move deletes the source, so what is lost has to be read before it runs, and
// the move itself is sync: read here, say it from the move once the copy lands.

import { type EnvelopeTrack } from "#src/tools/clip/envelopes/envelope-track.ts";
import { crossTrackEnvelopeLoss } from "#src/tools/clip/envelopes/cross-track-envelopes.ts";
import { manageOffered } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type ClipReasons } from "../entries/clip-reasons.ts";
import { type ClipPayload } from "../call/resolve-clip-targets.ts";

/**
 * Read what moving the clip to its destination slot would do to its device
 * envelopes, and keep it for the move to report.
 * @param clip - The clip about to move
 * @param motion - Where the call sends it
 * @param motion.destination - A clip slot on a regular track, or another place
 * @param motion.returnSlot - A clip slot on a return track
 * @param reasons - What each clip has to say, which keeps the answer
 * @param context - The request's context
 */
export async function readEnvelopeLoss(
  clip: LiveAPI,
  motion: Pick<ClipPayload, "destination" | "returnSlot">,
  reasons: ClipReasons,
  context: Partial<ToolContext>,
): Promise<void> {
  const to = slotTrack(motion);

  // An arrangement clip moves to a slot by re-creating it, which says its own.
  if (to == null || (clip.getProperty("is_arrangement_clip") as number) > 0) {
    return;
  }

  const loss = await crossTrackEnvelopeLoss(clip, to, {
    deadline: context.deadline,
    manage: manageOffered(context),
    reads: reasons.envelopeReads,
  });

  if (loss != null) {
    reasons.envelopeLosses.set(clip.id, loss);
  }
}

// --- Helpers below main export ---

/**
 * @param motion - Where the call sends the clip
 * @param motion.destination - A clip slot on a regular track, or another place
 * @param motion.returnSlot - A clip slot on a return track
 * @returns The track of the slot the clip goes to, or null when it goes to none
 */
function slotTrack({
  destination,
  returnSlot,
}: Pick<ClipPayload, "destination" | "returnSlot">): EnvelopeTrack | null {
  if (returnSlot != null) {
    return { kind: "return", index: returnSlot.returnIndex };
  }

  return destination?.kind === "slot"
    ? { kind: "regular", index: destination.trackIndex }
    : null;
}
