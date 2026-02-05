// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type { TilingContext } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import {
  getMinimalClipInfo,
  createClipsForLength,
  parseArrangementLength,
} from "./duplicate-helpers.ts";
import type { MinimalClipInfo } from "./duplicate-helpers.ts";
import { configureRouting } from "./duplicate-routing-helpers.ts";

/**
 * Callback type for forEachClipInScene
 */
type ClipInSceneCallback = (
  clip: LiveAPI,
  clipSlot: LiveAPI,
  trackIndex: number,
) => void;

/**
 * Iterate over all clips in a scene and call a callback for each
 * @param sceneIndex - Scene index
 * @param trackIds - Array of track IDs
 * @param callback - Callback to call for each clip
 */
function forEachClipInScene(
  sceneIndex: number,
  trackIds: string[],
  callback: ClipInSceneCallback,
): void {
  for (let trackIndex = 0; trackIndex < trackIds.length; trackIndex++) {
    const clipSlot = LiveAPI.from(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );

    if (clipSlot.exists() && clipSlot.getProperty("has_clip")) {
      const clip = LiveAPI.from(`${clipSlot.path} clip`);

      if (clip.exists()) {
        callback(clip, clipSlot, trackIndex);
      }
    }
  }
}

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
          "Removed Producer Pal device from duplicated track - the device cannot be duplicated",
        );
      }
    } catch {
      // If we can't access this_device, just continue without removing anything
      console.warn(
        "Could not check for Producer Pal device in duplicated track",
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
      const clip = LiveAPI.from(`${clipSlot.path} clip`);

      duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
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
      duplicatedClips.push(getMinimalClipInfo(clip, ["trackIndex"]));
    }
  }
}

/**
 * Duplicate a track
 * @param trackIndex - Track index to duplicate
 * @param name - Optional name for the duplicated track
 * @param withoutClips - Whether to exclude clips when duplicating
 * @param withoutDevices - Whether to exclude devices when duplicating
 * @param routeToSource - Whether to route the new track to the source track
 * @param sourceTrackIndex - Source track index for routing
 * @returns Track info object with id, trackIndex, and clips array
 */
export function duplicateTrack(
  trackIndex: number,
  name?: string,
  withoutClips?: boolean,
  withoutDevices?: boolean,
  routeToSource?: boolean,
  sourceTrackIndex?: number,
): { id: string; trackIndex: number; clips: MinimalClipInfo[] } {
  const liveSet = LiveAPI.from("live_set");

  liveSet.call("duplicate_track", trackIndex);

  const newTrackIndex = trackIndex + 1;
  const newTrack = LiveAPI.from(`live_set tracks ${newTrackIndex}`);

  if (name != null) {
    newTrack.set("name", name);
  }

  removeHostTrackDevice(trackIndex, withoutDevices, newTrack);

  if (withoutDevices === true) {
    deleteAllDevices(newTrack);
  }

  const duplicatedClips = processClipsForDuplication(newTrack, withoutClips);

  if (routeToSource) configureRouting(newTrack, sourceTrackIndex);

  return {
    id: newTrack.id,
    trackIndex: newTrackIndex,
    clips: duplicatedClips,
  };
}

/**
 * Duplicate a scene
 * @param sceneIndex - Scene index to duplicate
 * @param name - Optional name for the duplicated scene
 * @param withoutClips - Whether to exclude clips when duplicating
 * @returns Scene info object with id, sceneIndex, and clips array
 */
export function duplicateScene(
  sceneIndex: number,
  name?: string,
  withoutClips?: boolean,
): { id: string; sceneIndex: number; clips: MinimalClipInfo[] } {
  const liveSet = LiveAPI.from("live_set");

  liveSet.call("duplicate_scene", sceneIndex);

  const newSceneIndex = sceneIndex + 1;
  const newScene = LiveAPI.from(`live_set scenes ${newSceneIndex}`);

  if (name != null) {
    newScene.set("name", name);
  }

  // Get all duplicated clips in this scene
  const duplicatedClips: MinimalClipInfo[] = [];
  const trackIds = liveSet.getChildIds("tracks");

  if (withoutClips === true) {
    // Delete all clips in the duplicated scene
    forEachClipInScene(newSceneIndex, trackIds, (_clip, clipSlot) => {
      clipSlot.call("delete_clip");
    });
  } else {
    // Default behavior: collect info about duplicated clips
    forEachClipInScene(newSceneIndex, trackIds, (clip) => {
      duplicatedClips.push(getMinimalClipInfo(clip, ["sceneIndex"]));
    });
  }

  // Return optimistic metadata
  return {
    id: newScene.id,
    sceneIndex: newSceneIndex,
    clips: duplicatedClips,
  };
}

/**
 * Calculate the length of a scene (longest clip in the scene)
 * @param sceneIndex - Scene index
 * @returns Length in Ableton beats
 */
export function calculateSceneLength(sceneIndex: number): number {
  const liveSet = LiveAPI.from("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  let maxLength = 4; // Default minimum scene length

  forEachClipInScene(sceneIndex, trackIds, (clip) => {
    const clipLength = clip.getProperty("length") as number;

    maxLength = Math.max(maxLength, clipLength);
  });

  return maxLength;
}

/**
 * Assign scene name to clip info objects
 * @param clips - Array of clip info objects
 * @param name - Name to assign to each clip
 */
function assignNamesToClips(clips: MinimalClipInfo[], name: string): void {
  for (const clipInfo of clips) {
    clipInfo.name = name;
  }
}

/**
 * Duplicate a scene to the arrangement view
 * @param sceneId - Scene ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param name - Optional name for the duplicated clips
 * @param withoutClips - Whether to exclude clips when duplicating
 * @param arrangementLength - Optional length in bar:beat format
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @param context - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns Object with arrangementStart and clips array
 */
export function duplicateSceneToArrangement(
  sceneId: string,
  arrangementStartBeats: number,
  name?: string,
  withoutClips?: boolean,
  arrangementLength?: string,
  songTimeSigNumerator = 4,
  songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
): { arrangementStart: string; clips: MinimalClipInfo[] } {
  const scene = LiveAPI.from(sceneId);

  if (!scene.exists()) {
    throw new Error(
      `duplicate failed: scene with id "${sceneId}" does not exist`,
    );
  }

  const sceneIndex = scene.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(
      `duplicate failed: no scene index for id "${sceneId}" (path="${scene.path}")`,
    );
  }

  const liveSet = LiveAPI.from("live_set");
  const trackIds = liveSet.getChildIds("tracks");

  const duplicatedClips: MinimalClipInfo[] = [];

  if (withoutClips !== true) {
    // Determine the length to use for all clips
    let arrangementLengthBeats: number;

    if (arrangementLength != null) {
      arrangementLengthBeats = parseArrangementLength(
        arrangementLength,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    } else {
      // Default to the length of the longest clip in the scene
      arrangementLengthBeats = calculateSceneLength(sceneIndex);
    }

    // Only duplicate clips if withoutClips is not explicitly true
    // Find all clips in this scene and duplicate them to arrangement
    forEachClipInScene(sceneIndex, trackIds, (clip, _clipSlot, trackIndex) => {
      const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

      // Use the new length-aware clip creation logic
      // Omit arrangementStart since all clips share the same start time
      const clipsForTrack = createClipsForLength(
        clip,
        track,
        arrangementStartBeats,
        arrangementLengthBeats,
        name,
        ["arrangementStart"],
        context,
      );

      // Add the scene name to each clip result if provided
      if (name != null) {
        assignNamesToClips(clipsForTrack, name);
      }

      duplicatedClips.push(...clipsForTrack);
    });
  }

  return {
    arrangementStart: abletonBeatsToBarBeat(
      arrangementStartBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    ),
    clips: duplicatedClips,
  };
}
