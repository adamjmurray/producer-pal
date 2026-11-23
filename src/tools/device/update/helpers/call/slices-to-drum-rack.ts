// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A Simpler's `sliceToDrumRack` action. Only the remote script can convert, and
// the conversion replaces the Simpler, so it runs once the rest of the target's
// update is done and read back. The sync action only checks the Simpler is in
// slicing mode and leaves its entry pending for this to settle.

import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { parseAction } from "#src/tools/shared/device/specialized/specialized-device-action-parser.ts";
import {
  DRUM_RACK_PENDING,
  SLICE_TO_DRUM_RACK,
} from "#src/tools/shared/device/specialized/devices/simpler/simpler-slicing.ts";
import { type ActionResult } from "#src/tools/shared/device/specialized/specialized-device-types.ts";
import { askedAnythingElse } from "#src/tools/shared/helpers/target-notes.ts";
import { convertSimplerToDrumRack } from "#src/tools/shared/remote-script/simpler-settings.ts";

/** What the conversion needs from the call. */
interface ConversionCall {
  deadline: number | null | undefined;
  /** Whether the caller can use ppal-manage (`manageOffered`) */
  manage: boolean;
  /** Told that the conversion may have changed Live */
  landed: (phrase: string) => void;
}

/** A target's entry, as far as the conversion reads and changes it. */
interface ConvertedEntry {
  id?: unknown;
  actions?: ActionResult[];
}

/**
 * Convert a Simpler whose entry has a pending `sliceToDrumRack`, and settle
 * that action's entry. The entry takes the new Drum Rack's id.
 * @param target - The target the entry is for
 * @param entry - The target's entry, changed in place
 * @param asked - What the call asked of this target
 * @param call - The request deadline, and what to tell of a change
 * @returns The entry; a promise when there was a conversion to wait for
 * @throws Error when the conversion didn't happen and it was all the call
 *   asked of this target, so the target is a skip
 */
export function slicesToDrumRack<T extends ConvertedEntry>(
  target: LiveAPI,
  entry: T,
  asked: object,
  call: ConversionCall,
): T | Promise<T> {
  const index = (entry.actions ?? []).findIndex(isPending);

  return index < 0 ? entry : convert(target, entry, index, asked, call);
}

// --- Helpers below main exports ---

/**
 * Whether an action entry is a conversion the sync action left pending.
 * @param result - One action's entry
 * @returns True for a pending `sliceToDrumRack`
 */
function isPending(result: ActionResult): boolean {
  return (
    "detail" in result &&
    result.detail === DRUM_RACK_PENDING &&
    parseAction(result.action)?.name.toLowerCase() ===
      SLICE_TO_DRUM_RACK.toLowerCase()
  );
}

/**
 * Run the conversion and settle the action's entry.
 * @param target - The Simpler
 * @param entry - The target's entry, changed in place
 * @param index - Where the pending action sits in `entry.actions`
 * @param asked - What the call asked of this target
 * @param call - The request deadline, and what to tell of a change
 * @returns The entry
 * @throws Error when nothing was converted and nothing else was asked
 */
async function convert<T extends ConvertedEntry>(
  target: LiveAPI,
  entry: T,
  index: number,
  asked: object,
  call: ConversionCall,
): Promise<T> {
  const actions = entry.actions as ActionResult[];
  const { action } = actions[index] as ActionResult;
  const { path } = target;
  const outcome = await convertSimplerToDrumRack(
    target,
    call.deadline,
    call.manage,
  );

  if (outcome.ok) {
    call.landed("converted to a Drum Rack");
    actions[index] = { action };
    // The rack sits where the Simpler was, as a new device.
    entry.id = LiveAPI.from(path).id;

    return entry;
  }

  let detail: string;

  if (outcome.stalled === "unanswered") {
    // The conversion may have reached Live before the wait ran out.
    call.landed("may have been converted to a Drum Rack");
    detail = `may have converted: ${outcome.reason}; read the device to check`;
    entry.id = LiveAPI.from(path).id;
  } else if (outcome.available) {
    detail = `not converted: ${outcome.reason}`;
  } else {
    detail =
      outcome.outdated === true
        ? outcome.reason
        : `needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(call.manage)}`;
  }

  actions[index] = { action, ok: false, detail };

  // With nothing else asked and no action landed, the target is a skip.
  if (
    actions.every((result) => "ok" in result) &&
    !askedAnythingElse(asked, ["actions"])
  ) {
    throw new Error(`no action landed — "${action}": ${detail}`);
  }

  return entry;
}
