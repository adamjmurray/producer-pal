// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { atomToString } from "#src/shared/max/max-atoms.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import {
  objectPathForApi,
  pathField,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { trackTypeField } from "#src/tools/track/helpers/track-type-helpers.ts";
import { fromLiveApiView } from "#src/tools/shared/utils.ts";
import { type SelectResult } from "../select.ts";
import { type TrackCategory } from "./selection-updates.ts";

/**
 * Read full current view state (for no-args calls)
 * @returns Current state with all non-null selection info
 */
export function readFullState(): SelectResult {
  const appView = LiveAPI.from(livePath.view.app);
  const result: SelectResult = {
    view: fromLiveApiView(
      appView.getProperty("focused_document_view") as string,
    ),
  };

  const track = LiveAPI.from(livePath.view.selectedTrack);
  const trackInfo = buildTrackInfo(track);

  if (trackInfo) {
    result.selectedTrack = trackInfo;
  }

  const scene = LiveAPI.from(livePath.view.selectedScene);
  const sceneInfo = buildSceneInfo(scene);

  if (sceneInfo) {
    result.selectedScene = sceneInfo;
  }

  const detailClip = LiveAPI.from(livePath.view.detailClip);
  const clipInfo = buildClipInfo(detailClip);

  if (clipInfo) {
    result.selectedClip = clipInfo;
  }

  if (track.exists()) {
    const deviceInfo = readSelectedDeviceInfo(track);

    if (deviceInfo) {
      result.selectedDevice = deviceInfo;
    }
  }

  return result;
}

/**
 * Build response fields for track selection using the track's Live API ID
 * @param liveApiId - Live API ID (e.g., "id track_123")
 * @returns Track info, or undefined
 */
export function buildTrackResponseFromId(
  liveApiId: string,
): SelectResult["selectedTrack"] {
  const track = LiveAPI.from(liveApiId);

  return buildTrackInfo(track);
}

/**
 * Build response fields for scene selection using the scene's Live API ID
 * @param liveApiId - Live API ID (e.g., "id scene_123")
 * @returns Scene info, or undefined
 */
export function buildSceneResponseFromId(
  liveApiId: string,
): SelectResult["selectedScene"] {
  const scene = LiveAPI.from(liveApiId);

  return buildSceneInfo(scene);
}

/**
 * Build response fields for clip selection by ID
 * @param clipId - Live API clip ID (e.g., "id clip_123")
 * @returns Clip info, or undefined
 */
export function buildClipResponseFromId(
  clipId: string,
): SelectResult["selectedClip"] {
  const clip = LiveAPI.from(clipId);

  return buildClipInfo(clip);
}

/**
 * Build response fields for clip found in a clip slot
 * @param slot - Clip slot coordinates
 * @param slot.trackIndex - Track index
 * @param slot.sceneIndex - Scene index
 * @returns Clip info, or undefined
 */
export function buildClipResponseFromSlot(slot: {
  trackIndex: number;
  sceneIndex: number;
}): SelectResult["selectedClip"] {
  const clipPath = livePath
    .track(slot.trackIndex)
    .clipSlot(slot.sceneIndex)
    .clip();
  const clip = LiveAPI.from(clipPath);

  return buildClipInfo(clip);
}

/**
 * Build response fields for an already-resolved selected device, reusing the
 * object the selection step built rather than resolving it again.
 * @param device - The selected device
 * @param devicePath - The short path the caller selected it by, if any
 * @returns Device info, or undefined
 */
export function buildDeviceResponseFromDevice(
  device: LiveAPI,
  devicePath: string | undefined,
): SelectResult["selectedDevice"] {
  if (!device.exists()) {
    return undefined;
  }

  const path = devicePath ?? extractDevicePath(device.path);

  return path ? { id: device.id, path } : undefined;
}

export interface ResolvedArgs {
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  trackIndex?: number;
  category: TrackCategory;
  sceneIndex?: number;
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  devicePath?: string;
  devicePathParam?: "path" | "devicePath";
  rackTargetId?: string;
  rackTargetPath?: string;
  hasArgs: boolean;
  viewOnly: boolean;
}

/**
 * Add track info to action response if a track was selected
 * @param result - Response being built
 * @param selectedTrackId - Live API ID of selected track, if any
 */
export function addTrackToResponse(
  result: SelectResult,
  selectedTrackId: string | undefined,
): void {
  if (selectedTrackId != null) {
    const info = buildTrackResponseFromId(selectedTrackId);

    if (info) {
      result.selectedTrack = info;
    }
  }
}

/**
 * Add scene info to action response if a scene was selected
 * @param result - Response being built
 * @param selectedSceneId - Live API ID of selected scene, if any
 */
export function addSceneToResponse(
  result: SelectResult,
  selectedSceneId: string | undefined,
): void {
  if (selectedSceneId != null) {
    const info = buildSceneResponseFromId(selectedSceneId);

    if (info) {
      result.selectedScene = info;
    }
  }
}

/**
 * Add clip info to action response if a clip was selected
 * @param result - Response being built
 * @param resolved - Resolved args
 * @param clipSlotHasClip - Whether clipSlot had a clip
 */
export function addClipToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
  clipSlotHasClip: boolean,
): void {
  if (resolved.clipId != null) {
    const info = buildClipResponseFromId(resolved.clipId);

    if (info) {
      result.selectedClip = info;
    }
  } else if (clipSlotHasClip && resolved.parsedClipSlot != null) {
    const info = buildClipResponseFromSlot(resolved.parsedClipSlot);

    if (info) {
      result.selectedClip = info;
    }
  }
}

/**
 * Add device info to action response if a device was selected, reusing the
 * device the selection step already resolved.
 * @param result - Response being built
 * @param resolved - Resolved args
 * @param selectedDeviceAPI - The device selection resolved, if any
 */
export function addDeviceToResponse(
  result: SelectResult,
  resolved: ResolvedArgs,
  selectedDeviceAPI: LiveAPI | undefined,
): void {
  if (selectedDeviceAPI == null) {
    return;
  }

  const info = buildDeviceResponseFromDevice(
    selectedDeviceAPI,
    resolved.devicePath,
  );

  if (info) {
    result.selectedDevice = info;
  }
}

/**
 * Build track info from a LiveAPI track reference
 * @param track - LiveAPI reference to a track
 * @returns Track info or undefined if track doesn't exist
 */
function buildTrackInfo(
  track: LiveAPI,
): SelectResult["selectedTrack"] | undefined {
  if (!track.exists()) {
    return undefined;
  }

  const category = track.category;

  if (category == null) {
    return undefined;
  }

  return {
    id: track.id,
    ...pathField(track),
    ...trackTypeField(
      (track.getProperty("has_midi_input") as number) > 0,
      category,
    ),
  };
}

/**
 * Build scene info from a LiveAPI scene reference
 * @param scene - LiveAPI reference to a scene
 * @returns Scene info, or undefined when the scene is gone or unnameable
 */
function buildSceneInfo(
  scene: LiveAPI,
): SelectResult["selectedScene"] | undefined {
  if (!scene.exists()) {
    return undefined;
  }

  const path = objectPathForApi(scene);

  return path == null ? undefined : { id: scene.id, path };
}

/**
 * Build clip info from a LiveAPI clip reference
 * @param clip - LiveAPI reference to a clip
 * @returns Clip info with its path
 */
function buildClipInfo(
  clip: LiveAPI,
): SelectResult["selectedClip"] | undefined {
  if (!clip.exists()) {
    return undefined;
  }

  const isSessionClip = clip.trackIndex != null && clip.clipSlotIndex != null;

  return {
    id: clip.id,
    path: isSessionClip
      ? slotPath(clip.trackIndex, clip.clipSlotIndex)
      : objectPathForApi(clip),
  };
}

/**
 * Read the selected device info from a track's view
 * @param track - LiveAPI reference to the selected track
 * @returns Device info or undefined if no device selected
 */
function readSelectedDeviceInfo(
  track: LiveAPI,
): SelectResult["selectedDevice"] | undefined {
  const trackView = LiveAPI.from(`${track.path} view`);

  if (!trackView.exists()) {
    return undefined;
  }

  const deviceResult = trackView.getPropertyList("selected_device");

  if (!deviceResult[1]) {
    return undefined;
  }

  const rawId = atomToString(deviceResult[1]);
  const device = LiveAPI.from(`id ${rawId}`);

  if (!device.exists()) {
    return undefined;
  }

  const path = extractDevicePath(device.path);

  return path ? { id: rawId, path } : undefined;
}
