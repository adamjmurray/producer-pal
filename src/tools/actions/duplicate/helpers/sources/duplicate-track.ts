// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import { configureRouting } from "../duplicate-routing.ts";

/**
 * Remove the Producer Pal device from a duplicated track if it was the host track
 * @param trackIndex - Original track index
 * @param withoutDevices - Whether devices were excluded
 * @param newTrack - The new track LiveAPI object
 */
function removeHostTrackDevice(
  trackIndex: number,
  withoutDevices: boolean | undefined,
  newTrack: LiveAPI,
): void {
  const hostTrackIndex = getHostTrackIndex();

  if (trackIndex === hostTrackIndex && withoutDevices !== true) {
    try {
      const thisDevice = LiveAPI.from("this_device");
      const thisDevicePath = thisDevice.path;

      // Extract device index from path like "live_set tracks 1 devices 0"
      const deviceIndexMatch = thisDevicePath.match(/devices (\d+)/);

      if (deviceIndexMatch) {
        newTrack.call(
          "delete_device",
          Number.parseInt(deviceIndexMatch[1] ?? ""),
        );
        console.warn(
          `removed the Producer Pal device from the new track ${targetLabel(newTrack)} - it cannot be duplicated`,
        );
      }
    } catch {
      // If we can't access this_device, just continue without removing anything
      console.warn(
        `could not check the new track ${targetLabel(newTrack)} for the Producer Pal device`,
      );
    }
  }
}

/**
 * Delete all devices from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteAllDevices(newTrack: LiveAPI): void {
  // Delete from the end backwards to avoid index shifting
  const deviceCount = newTrack.getChildIds("devices").length;

  for (let i = deviceCount - 1; i >= 0; i--) {
    newTrack.call("delete_device", i);
  }
}

/**
 * Collect or delete clips from a duplicated track
 * @param newTrack - The new track LiveAPI object
 * @param withoutClips - Whether to delete clips instead of collecting them
 * @returns Array of clip info objects
 */
function processClipsForDuplication(
  newTrack: LiveAPI,
  withoutClips: boolean | undefined,
): MinimalClipInfo[] {
  const duplicatedClips: MinimalClipInfo[] = [];

  if (withoutClips === true) {
    deleteSessionClips(newTrack);
    deleteArrangementClips(newTrack);
  } else {
    collectSessionClips(newTrack, duplicatedClips);
    collectArrangementClips(newTrack, duplicatedClips);
  }

  return duplicatedClips;
}

/**
 * Delete all session clips from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteSessionClips(newTrack: LiveAPI): void {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");

  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = LiveAPI.from(clipSlotId);

    if (clipSlot.getProperty("has_clip")) {
      clipSlot.call("delete_clip");
    }
  }
}

/**
 * Delete all arrangement clips from a track
 * @param newTrack - The track LiveAPI object
 */
function deleteArrangementClips(newTrack: LiveAPI): void {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");

  for (const clipId of arrangementClipIds) {
    newTrack.call("delete_clip", clipId);
  }
}

/**
 * Collect info about session clips in a track
 * @param newTrack - The track LiveAPI object
 * @param duplicatedClips - Array to append clip info to
 */
function collectSessionClips(
  newTrack: LiveAPI,
  duplicatedClips: MinimalClipInfo[],
): void {
  const sessionClipSlotIds = newTrack.getChildIds("clip_slots");

  for (const clipSlotId of sessionClipSlotIds) {
    const clipSlot = LiveAPI.from(clipSlotId);

    if (clipSlot.getProperty("has_clip")) {
      const clip = clipSlot.child("clip");

      duplicatedClips.push(getMinimalClipInfo(clip));
    }
  }
}

/**
 * Collect info about arrangement clips in a track
 * @param newTrack - The track LiveAPI object
 * @param duplicatedClips - Array to append clip info to
 */
function collectArrangementClips(
  newTrack: LiveAPI,
  duplicatedClips: MinimalClipInfo[],
): void {
  const arrangementClipIds = newTrack.getChildIds("arrangement_clips");

  for (const clipId of arrangementClipIds) {
    const clip = LiveAPI.from(clipId);

    if (clip.exists()) {
      duplicatedClips.push(getMinimalClipInfo(clip));
    }
  }
}

/**
 * Duplicate a track
 * @param trackIndex - Track index to duplicate
 * @param name - Optional name for the duplicated track
 * @param color - Optional color for the duplicated track
 * @param withoutClips - Whether to exclude clips when duplicating
 * @param withoutDevices - Whether to exclude devices when duplicating
 * @param routeToSource - Whether to route the new track to the source track
 * @param sourceTrackIndex - Source track index for routing
 * @returns Track info object with id, path, and clips array
 */
export function duplicateTrack(
  trackIndex: number,
  name?: string,
  color?: string,
  withoutClips?: boolean,
  withoutDevices?: boolean,
  routeToSource?: boolean,
  sourceTrackIndex?: number,
): { id: string; path: string; clips: MinimalClipInfo[] } {
  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call("duplicate_track", trackIndex);

  const newTrackIndex = trackIndex + 1;
  const newTrack = LiveAPI.from(livePath.track(newTrackIndex));

  if (name != null) {
    newTrack.set("name", name);
  }

  if (color != null) {
    newTrack.setColor(color);
  }

  removeHostTrackDevice(trackIndex, withoutDevices, newTrack);

  if (withoutDevices === true) {
    deleteAllDevices(newTrack);
  }

  const duplicatedClips = processClipsForDuplication(newTrack, withoutClips);

  if (routeToSource) {
    configureRouting(newTrack, sourceTrackIndex);
  }

  return {
    id: newTrack.id,
    path: formatObjectPath({ kind: "track", trackIndex: newTrackIndex }),
    clips: duplicatedClips,
  };
}
