// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type DeviceCopy } from "./device-copy-entry.ts";
import { copyDeviceInPlace } from "./remote-script-copy/in-place-device-copy.ts";
import { copyThroughTempTrack } from "./temp-track-device-copy.ts";

/**
 * Duplicate a device. With the remote script, Live copies it itself; without
 * it, or for an instrument (Live refuses those), the track holding the device
 * is duplicated and the copy taken off it:
 * 1. Duplicate the track containing the device
 * 2. Move the duplicated device to the destination
 * 3. Delete the temporary track
 *
 * Once the copy is placed, the device exists: a name that won't take, or a
 * temp track that won't go, is on its entry rather than a throw.
 * @param device - LiveAPI device object to duplicate
 * @param toPath - Destination path (e.g., "t1/d0", "t0/d0/c0/d1")
 * @param name - Optional name for the duplicated device
 * @param deadline - The request deadline from ToolContext
 * @returns The new device's id
 * @throws Error when no copy was made
 */
export async function duplicateDevice(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  deadline?: number | null,
): Promise<DeviceCopy> {
  // A copy would be a second Producer Pal device fighting the first for the
  // same connection — and the track-duplication workaround below spawns one
  // before it ever reaches the destination.
  if (isProducerPalDevice(device)) {
    throw new Error(
      `cannot duplicate the Producer Pal device ${targetLabel(device)}`,
    );
  }

  // Read before any copy exists: a temp track shifts every later track index,
  // so a path read inside the copy would name the wrong track.
  const sourceLabel = targetLabel(device);
  const notes = newTargetNotes();
  const copy =
    (await copyDeviceInPlace(
      device,
      toPath,
      name,
      sourceLabel,
      notes,
      deadline,
    )) ?? copyThroughTempTrack(device, toPath, name, sourceLabel, notes);
  const detail = joinDetails(notes.said);

  return detail == null ? copy : { ...copy, detail };
}
