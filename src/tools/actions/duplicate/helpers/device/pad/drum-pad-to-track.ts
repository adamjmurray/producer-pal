// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { midiToNoteName } from "#src/shared/pitch.ts";
import { findDrumPadByNote } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { convertDrumPadToTrack } from "#src/tools/shared/remote-script/device-conversions/convert-devices.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type DuplicateDrumPadResult,
  type PadTarget,
  refuseRackWithoutPads,
} from "./duplicate-drum-pad.ts";

/** The toPath that sends a pad's chain to a new track. */
export const PAD_TO_NEW_TRACK = "t+";

/** What the copy needs from the call. */
interface PadCopyCall {
  deadline: number | null | undefined;
  /** Whether the caller can use ppal-manage (`manageOffered`) */
  manage: boolean;
}

/**
 * Copy a drum pad's chain onto a new MIDI track after the last one, through
 * the remote script. The pad keeps its chain; no clips are copied.
 * @param source - The pad to copy from
 * @param name - Optional name for the new track; Live names it after the pad
 * @param call - The request deadline, and whether ppal-manage is offered
 * @returns The new track
 * @throws Error when nothing was copied, or it can't be told
 */
export async function duplicateDrumPadToTrack(
  source: PadTarget,
  name: string | undefined,
  call: PadCopyCall,
): Promise<DuplicateDrumPadResult> {
  const rack = LiveAPI.from(source.rackPath);

  refuseRackWithoutPads(rack);

  const pad = findDrumPadByNote(rack, source.midi);
  const label = pad == null ? midiToNoteName(source.midi) : targetLabel(pad);

  if (pad == null || pad.getChildCount("chains") === 0) {
    throw new Error(`drum pad ${label} is empty, nothing to copy`);
  }

  // A second Producer Pal device would fight the first for the MCP port.
  if (pad.someChild("chains", isProducerPalDevice)) {
    throw new Error(
      `cannot duplicate drum pad ${label}: it holds the Producer Pal device`,
    );
  }

  const outcome = await convertDrumPadToTrack(
    { devicePath: source.rackPath, note: source.midi },
    call.deadline,
    call.manage,
  );

  if (!outcome.ok) {
    throw new Error(whyNotCopied(outcome, call.manage));
  }

  const track = LiveAPI.from(livePath.track(outcome.result.track_index));

  if (name != null) {
    track.set("name", name);
  }

  return { id: track.id, path: pathField(track).path as string };
}

// --- Helpers below main exports ---

/**
 * Word why the remote script made no track.
 * @param outcome - The failed route outcome
 * @param outcome.reason - Why it failed
 * @param outcome.available - Whether the remote script answered at all
 * @param outcome.outdated - Set when the remote script is too old
 * @param outcome.stalled - Set when no time was left or no answer came
 * @param manage - Whether the caller can use ppal-manage
 * @returns The skip reason
 */
function whyNotCopied(
  outcome: {
    reason: string;
    available: boolean;
    outdated?: true;
    stalled?: "out-of-time" | "unanswered";
  },
  manage: boolean,
): string {
  if (outcome.stalled === "unanswered") {
    return `may have copied: ${outcome.reason}; look for a new track before copying again`;
  }

  if (outcome.outdated === true) {
    return outcome.reason;
  }

  return outcome.available
    ? `not copied: ${outcome.reason}`
    : `not copied: a pad's copy to a new track needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(manage)}`;
}
