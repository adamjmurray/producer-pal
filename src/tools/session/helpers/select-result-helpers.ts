// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SelectResult } from "../select.ts";
import { type TrackCategory } from "./select-helpers.ts";
import {
  buildClipResponseFromId,
  buildClipResponseFromSlot,
  buildDeviceResponseFromDevice,
  buildSceneResponseFromId,
  buildTrackResponseFromId,
} from "./select-response-helpers.ts";

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
