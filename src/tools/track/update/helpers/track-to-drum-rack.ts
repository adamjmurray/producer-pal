// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type TargetNotes,
  noteSetAltered,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import { convertTrackToDrumRack } from "#src/tools/shared/remote-script/device-conversions/convert-devices.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** What the conversion needs from the call. */
export interface TrackConversionCall {
  deadline: number | null | undefined;
  /** Whether the caller can use ppal-manage (`manageOffered`) */
  manage: boolean;
}

/** What a conversion made: the new track, holding the Drum Rack. */
export interface TrackConverted {
  track: { id: string; path?: string; name: string };
  /** Set when Live deleted the source track, which had no clips */
  sourceRemoved?: true;
}

const REMOVED_DETAIL =
  "the track had no clips, so Live removed it: its devices and name are on the new track";

/**
 * Put a track's devices on pad C1 of a new Drum Rack, on a new track right
 * after it, through the remote script. A conversion that didn't happen is
 * noted as refused work, so a track asked for nothing else is a skip.
 * @param track - The source track
 * @param notes - What the track's entry has to say, added to
 * @param call - The request deadline, and whether ppal-manage is offered
 * @returns The new track, or undefined when there isn't one to report
 */
export async function trackToDrumRack(
  track: LiveAPI,
  notes: TargetNotes,
  call: TrackConversionCall,
): Promise<TrackConverted | undefined> {
  const index = track.trackIndex;

  // Return and main tracks aren't among the tracks Live converts.
  if (index == null) {
    refuseTargetWork(notes, ["convert"], notConverted(ONLY_REGULAR));

    return undefined;
  }

  // Its devices would move to the new track, or Live would delete this one.
  // The path check covers the device inside a rack or a drum pad too.
  if (isProducerPalDevice(track)) {
    refuseTargetWork(notes, ["convert"], notConverted(HOLDS_PRODUCER_PAL));

    return undefined;
  }

  const outcome = await convertTrackToDrumRack(
    index,
    call.deadline,
    call.manage,
  );

  if (outcome.ok) {
    noteSetAltered(notes, "converted to a Drum Rack on a new track");

    const made = LiveAPI.from(livePath.track(outcome.result.track_index));
    const sourceRemoved = outcome.result.source_removed;

    if (sourceRemoved) {
      notes.said.push(REMOVED_DETAIL);
    }

    return {
      track: { id: made.id, ...pathField(made), name: made.getName() },
      ...(sourceRemoved && { sourceRemoved: true }),
    };
  }

  if (outcome.stalled === "unanswered") {
    // The conversion may have reached Live before the wait ran out.
    noteSetAltered(notes, "may have been converted to a Drum Rack");
    notes.said.push(
      `may have converted: ${outcome.reason}; look for a new track before converting again`,
    );

    return undefined;
  }

  let detail = outcome.reason;

  if (!outcome.available && outcome.outdated !== true) {
    detail = `it needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(call.manage)}`;
  }

  refuseTargetWork(
    notes,
    ["convert"],
    outcome.outdated === true ? detail : notConverted(detail),
  );

  return undefined;
}

// --- Helpers below main exports ---

const ONLY_REGULAR = "only a regular track can be converted";
const HOLDS_PRODUCER_PAL = "the track holds the Producer Pal device";

/**
 * Word why a conversion didn't happen.
 * @param reason - Why
 * @returns The detail
 */
function notConverted(reason: string): string {
  return `not converted: ${reason}`;
}
