// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/tracks/get-host-track-index.ts";
import {
  noteTarget,
  type TargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import { extractPathWithinTrack } from "./temp-track-copy.ts";
import { type LandedTrackCopy } from "../sources/landed-track-copy.ts";

/**
 * Remove the Producer Pal device from the copy of its host track. A group's
 * copy holds copies of its members right after it, in the same order, so the
 * host may be one of those.
 *
 * Only that one device goes: the copy has it at the same place in the track, so
 * it is deleted from its own chain, never the rack that holds it.
 * @param trackIndex - The source track
 * @param landing - Where the copy landed
 * @param withoutDevices - Whether devices were excluded
 * @param notes - What the copy's entry should say
 */
export function removeHostTrackDevice(
  trackIndex: number,
  landing: LandedTrackCopy,
  withoutDevices: boolean | undefined,
  notes: TargetNotes,
): void {
  const hostTrackIndex = getHostTrackIndex();

  if (hostTrackIndex == null || withoutDevices === true) {
    return;
  }

  const offset = hostTrackIndex - trackIndex;

  if (offset < 0 || offset >= landing.added) {
    return;
  }

  try {
    const withinTrack = extractPathWithinTrack(
      LiveAPI.from("this_device").path,
      "Producer Pal device",
    );

    deleteCopiedDevice(livePath.track(landing.index + offset), withinTrack);
    noteTarget(notes, "the Producer Pal device was not copied");
  } catch {
    // this_device is unreadable or the copy has no such device, so nothing was
    // removed either way.
    noteTarget(
      notes,
      "could not check the new track for the Producer Pal device",
    );
  }
}

// --- Helpers below main export ---

/**
 * Delete one device from a track copy, by its path within the track.
 * @param trackPath - The copy's Live API path
 * @param withinTrack - The device's path in its track, e.g. "devices 0 chains 1
 *   devices 2"
 * @throws Error when the path doesn't end at a device
 */
function deleteCopiedDevice(trackPath: PathLike, withinTrack: string): void {
  const steps = withinTrack.split(" ");
  const index = steps.pop();
  const collection = steps.pop();

  if (collection !== "devices" || index == null) {
    throw new Error(`"${withinTrack}" is not a device path`);
  }

  // Walk down to the device's own parent: the track, or the chain it sits in.
  let parent = LiveAPI.from(trackPath.toString());

  for (let step = 0; step < steps.length; step += 2) {
    parent = parent.child(steps[step] as string, steps[step + 1] as string);
  }

  parent.call("delete_device", Number.parseInt(index));
}
