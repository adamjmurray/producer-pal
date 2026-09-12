// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TrackPath,
  livePath,
} from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { toLiveApiId, toLiveApiView } from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

export type TrackCategory = "regular" | "return" | "master";

export interface TrackSelectionResult {
  selectedTrackId?: string;
}

export interface SceneSelectionResult {
  selectedSceneId?: string;
}

interface UpdateTrackSelectionOptions {
  songView: LiveAPI;
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
}

interface UpdateSceneSelectionOptions {
  songView: LiveAPI;
  sceneId?: string;
  sceneIndex?: number;
}

interface UpdateDeviceSelectionOptions {
  songView: LiveAPI;
  deviceId?: string;
  devicePath?: string;
  devicePathParam: "path" | "devicePath";
  /** The device already resolved for `devicePath` by the existence check, so
   * this doesn't re-resolve it from the path string. */
  resolvedDevice?: LiveAPI;
}

interface UpdateHighlightedClipSlotOptions {
  songView: LiveAPI;
  clipSlot?: { trackIndex: number; sceneIndex: number };
}

/**
 * Build track path string based on category and index
 * @param category - Track category ('regular', 'return', or 'master')
 * @param trackIndex - Track index (0-based)
 * @returns Track path string or null if invalid category
 */
export function buildTrackPath(
  category?: string | null,
  trackIndex?: number | null,
): TrackPath | null {
  const finalCategory = category ?? "regular";

  if (finalCategory === "regular") {
    if (trackIndex == null) {
      return null;
    }

    return livePath.track(trackIndex);
  }

  if (finalCategory === "return") {
    if (trackIndex == null) {
      return null;
    }

    return livePath.returnTrack(trackIndex);
  }

  if (finalCategory === "master") {
    return livePath.masterTrack();
  }

  return null;
}

/**
 * Update track selection in Live
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.trackId - Track ID to select
 * @param options.category - Track category
 * @param options.trackIndex - Track index
 * @returns Selection result with track info
 */
export function updateTrackSelection({
  songView,
  trackId,
  category,
  trackIndex,
}: UpdateTrackSelectionOptions): TrackSelectionResult {
  const result: TrackSelectionResult = {};

  if (trackId != null) {
    const trackAPI = validateIdType(trackId, "track");
    const liveApiTrackId = toLiveApiId(trackAPI.id);

    songView.setProperty("selected_track", liveApiTrackId);
    result.selectedTrackId = liveApiTrackId;
  } else if (category != null || trackIndex != null) {
    const trackPath = buildTrackPath(category, trackIndex);

    if (trackPath) {
      const liveApiTrackId = toLiveApiId(LiveAPI.from(trackPath).id);

      songView.setProperty("selected_track", liveApiTrackId);
      result.selectedTrackId = liveApiTrackId;
    }
  }

  return result;
}

/**
 * Update scene selection in Live
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.sceneId - Scene ID to select
 * @param options.sceneIndex - Scene index
 * @returns Selection result with scene info
 */
export function updateSceneSelection({
  songView,
  sceneId,
  sceneIndex,
}: UpdateSceneSelectionOptions): SceneSelectionResult {
  const result: SceneSelectionResult = {};

  if (sceneId != null) {
    const sceneAPI = validateIdType(sceneId, "scene");
    const liveApiSceneId = toLiveApiId(sceneAPI.id);

    songView.setProperty("selected_scene", liveApiSceneId);
    result.selectedSceneId = liveApiSceneId;
  } else if (sceneIndex != null) {
    const finalSceneId = toLiveApiId(
      LiveAPI.from(livePath.scene(sceneIndex)).id,
    );

    songView.setProperty("selected_scene", finalSceneId);
    result.selectedSceneId = finalSceneId;
  }

  return result;
}

/**
 * Update device selection in Live
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.deviceId - Device ID to select
 * @param options.devicePath - Device path (e.g. "t0/d1")
 * @param options.devicePathParam - The param the device path came from
 * @param options.resolvedDevice - The device already resolved for `devicePath`
 * @returns The resolved device, or undefined if none was targeted/found
 */
export function updateDeviceSelection({
  songView,
  deviceId,
  devicePath,
  devicePathParam,
  resolvedDevice,
}: UpdateDeviceSelectionOptions): LiveAPI | undefined {
  if (deviceId != null) {
    const deviceAPI = validateIdType(deviceId, "device");

    songView.call("select_device", toLiveApiId(deviceId));

    return deviceAPI;
  } else if (devicePath != null) {
    const deviceAPI =
      resolvedDevice ?? resolveDeviceFromPath(devicePath, devicePathParam);

    songView.call("select_device", toLiveApiId(deviceAPI.id));

    return deviceAPI;
  }

  return undefined;
}

/**
 * Resolve a device path when the existence check didn't already resolve it
 * (a path naming a chain or other non-device target).
 * @param devicePath - Device path (e.g. "t0/d1")
 * @param devicePathParam - The param the device path came from
 * @returns The resolved device
 */
function resolveDeviceFromPath(
  devicePath: string,
  devicePathParam: "path" | "devicePath",
): LiveAPI {
  const resolved = resolvePathToLiveApi(devicePath);

  if (resolved.targetType !== "device") {
    throw new Error(
      `${devicePathParam} "${devicePath}" does not resolve to a device`,
    );
  }

  return LiveAPI.from(resolved.liveApiPath);
}

/**
 * Open or close a plug-in's (VST/AU) floating editor window. The `is_editor_open`
 * property is specific to the PluginDevice LOM class (Live 12.4+), so for any
 * other device this warns and skips rather than throwing.
 * @param device - The resolved target device, or undefined if none was targeted
 * @param open - true to open the editor window, false to close it
 * @returns true if the property was written (device is a plug-in)
 */
export function applyPluginEditorWindow(
  device: LiveAPI | undefined,
  open: boolean,
): boolean {
  if (device == null) {
    console.warn(
      "openPluginWindow requires a plug-in device — specify id or path",
    );

    return false;
  }

  if (device.type !== "PluginDevice") {
    console.warn(
      `openPluginWindow ignored — ${targetLabel(device)} is a ${device.type}, not a plug-in (VST/AU)`,
    );

    return false;
  }

  device.setProperty("is_editor_open", open ? 1 : 0);

  return true;
}

/**
 * Update highlighted clip slot in Live
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.clipSlot - Clip slot coordinates
 */
export function updateHighlightedClipSlot({
  songView,
  clipSlot,
}: UpdateHighlightedClipSlotOptions): void {
  if (clipSlot != null) {
    const { trackIndex, sceneIndex } = clipSlot;
    const clipSlotAPI = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (clipSlotAPI.exists()) {
      songView.setProperty(
        "highlighted_clip_slot",
        toLiveApiId(clipSlotAPI.id),
      );
    }
  }
}

interface UpdateClipSlotSelectionOptions {
  songView: LiveAPI;
  clipSlot: { trackIndex: number; sceneIndex: number };
}

/**
 * Highlight a clip slot and select its clip if present
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.clipSlot - Parsed clip slot coordinates
 * @returns Whether the slot contained a clip
 */
export function updateClipSlotSelection({
  songView,
  clipSlot,
}: UpdateClipSlotSelectionOptions): boolean {
  updateHighlightedClipSlot({ songView, clipSlot });

  const clipSlotAPI = LiveAPI.from(
    livePath.track(clipSlot.trackIndex).clipSlot(clipSlot.sceneIndex),
  );

  const hasClip = clipSlotAPI.getProperty("has_clip") as number;

  if (!hasClip) {
    return false;
  }

  const clipInSlot = LiveAPI.from(`${clipSlotAPI.path} clip`);

  if (clipInSlot.exists()) {
    songView.setProperty("detail_clip", toLiveApiId(clipInSlot.id));
  }

  return true;
}

interface ApplyDetailViewOptions {
  appView: LiveAPI;
  detailView: "clip" | "device" | "none";
}

/**
 * Apply a detail view change
 * @param options - View parameters
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.detailView - Detail view to show or hide
 */
export function applyDetailView({
  appView,
  detailView,
}: ApplyDetailViewOptions): void {
  if (detailView === "clip") {
    appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
  } else if (detailView === "device") {
    appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN);
  } else {
    appView.call("hide_view", LIVE_API_VIEW_NAMES.DETAIL);
  }
}

interface UpdateClipSelectionOptions {
  appView: LiveAPI;
  songView: LiveAPI;
  clipId: string;
  /** Switch to the clip's view (session/arrangement). False when the caller
   * gave an explicit `view` — that wins, so this only selects the clip. */
  switchView: boolean;
}

/**
 * Update clip selection in Live, inferring session/arrangement view from
 * where the clip lives unless the caller already picked a view explicitly.
 * @param options - Selection parameters
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.clipId - Clip ID to select
 * @param options.switchView - Whether to switch to the clip's required view
 * @returns The view the clip lives in
 */
export function updateClipSelection({
  appView,
  songView,
  clipId,
  switchView,
}: UpdateClipSelectionOptions): "session" | "arrangement" {
  const clipAPI = validateIdType(clipId, "clip");
  const isSessionClip =
    clipAPI.trackIndex != null && clipAPI.clipSlotIndex != null;
  const requiredView = isSessionClip ? "session" : "arrangement";

  // Live API ignores a detail_clip set if in the wrong view.
  if (switchView) {
    appView.call("show_view", toLiveApiView(requiredView));
  }

  songView.setProperty("detail_clip", toLiveApiId(clipAPI.id));

  // For session clips, also highlight the clip slot
  if (isSessionClip) {
    updateHighlightedClipSlot({
      songView,
      clipSlot: {
        trackIndex: clipAPI.trackIndex,
        sceneIndex: clipAPI.clipSlotIndex,
      },
    });
  }

  return requiredView;
}
