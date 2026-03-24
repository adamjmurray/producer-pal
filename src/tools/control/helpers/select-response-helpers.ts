// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-builders.ts";
import { resolvePathToLiveApi } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { fromLiveApiView } from "#src/tools/shared/utils.ts";
import { type SelectResult } from "../select.ts";
import { type TrackCategory } from "./select-helpers.ts";

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

  if (trackInfo) result.selectedTrack = trackInfo;

  const scene = LiveAPI.from(livePath.view.selectedScene);
  const sceneInfo = buildSceneInfo(scene);

  if (sceneInfo) result.selectedScene = sceneInfo;

  const detailClip = LiveAPI.from(livePath.view.detailClip);
  const clipInfo = buildClipInfo(detailClip);

  if (clipInfo) result.selectedClip = clipInfo;

  if (track.exists()) {
    const deviceInfo = readSelectedDeviceInfo(track);

    if (deviceInfo) result.selectedDevice = deviceInfo;
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
 * Build response fields for device selection by ID
 * @param deviceId - Live API device ID (e.g., "id device_123")
 * @returns Device info, or undefined
 */
export function buildDeviceResponseFromId(
  deviceId: string,
): SelectResult["selectedDevice"] {
  const device = LiveAPI.from(deviceId);

  if (!device.exists()) return undefined;

  const path = extractDevicePath(String(device.path));

  return path ? { id: String(device.id), path } : undefined;
}

/**
 * Build response fields for device selection by path
 * @param devicePath - Short device path (e.g., "t0/d1")
 * @returns Device info, or undefined
 */
export function buildDeviceResponseFromPath(
  devicePath: string,
): SelectResult["selectedDevice"] {
  const resolved = resolvePathToLiveApi(devicePath);

  if (resolved.targetType !== "device") return undefined;

  const device = LiveAPI.from(resolved.liveApiPath);

  if (!device.exists()) return undefined;

  return { id: String(device.id), path: devicePath };
}

/**
 * Build track info from a LiveAPI track reference
 * @param track - LiveAPI reference to a track
 * @returns Track info or undefined if track doesn't exist
 */
function buildTrackInfo(
  track: LiveAPI,
): SelectResult["selectedTrack"] | undefined {
  if (!track.exists()) return undefined;

  const category = track.category as TrackCategory | null;

  if (category == null) return undefined;

  const type = computeTrackType(track, category);
  const info: NonNullable<SelectResult["selectedTrack"]> = {
    id: String(track.id),
    type: type ?? "unknown",
  };

  if (category === "regular" && track.trackIndex != null) {
    info.trackIndex = track.trackIndex;
  } else if (category === "return" && track.returnTrackIndex != null) {
    info.trackIndex = track.returnTrackIndex;
  }

  return info;
}

/**
 * Build scene info from a LiveAPI scene reference
 * @param scene - LiveAPI reference to a scene
 * @returns Scene info or undefined if scene doesn't exist
 */
function buildSceneInfo(
  scene: LiveAPI,
): SelectResult["selectedScene"] | undefined {
  if (!scene.exists() || scene.sceneIndex == null) return undefined;

  return { id: String(scene.id), sceneIndex: scene.sceneIndex };
}

/**
 * Build clip info from a LiveAPI clip reference
 * @param clip - LiveAPI reference to a clip
 * @returns Clip info with slot (session) or arrangementStart (arrangement)
 */
function buildClipInfo(
  clip: LiveAPI,
): SelectResult["selectedClip"] | undefined {
  if (!clip.exists()) return undefined;

  const isSessionClip = clip.trackIndex != null && clip.clipSlotIndex != null;

  if (isSessionClip) {
    return {
      id: String(clip.id),
      slot: `${clip.trackIndex}/${clip.clipSlotIndex}`,
    };
  }

  // Arrangement clip
  const startTime = clip.getProperty("start_time") as number;
  const liveSet = LiveAPI.from("live_set");
  const num = liveSet.getProperty("signature_numerator") as number;
  const den = liveSet.getProperty("signature_denominator") as number;

  return {
    id: String(clip.id),
    trackIndex: clip.trackIndex ?? undefined,
    arrangementStart: abletonBeatsToBarBeat(startTime, num, den),
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

  if (!trackView.exists()) return undefined;

  const deviceResult = trackView.get("selected_device") as unknown[] | null;

  if (!deviceResult?.[1]) return undefined;

  const rawId = String(deviceResult[1]);
  const device = LiveAPI.from(`id ${rawId}`);

  if (!device.exists()) return undefined;

  const path = extractDevicePath(String(device.path));

  return path ? { id: rawId, path } : undefined;
}

/**
 * Compute merged track type from category and has_midi_input
 * @param track - Selected track LiveAPI object
 * @param category - Internal category: "regular", "return", or "master"
 * @returns Merged type: "midi", "audio", "return", "master", or null
 */
function computeTrackType(
  track: LiveAPI,
  category: TrackCategory | null,
): string | null {
  if (category == null) return null;
  if (category === "return") return "return";
  if (category === "master") return "master";

  const isMidi = track.exists()
    ? (track.getProperty("has_midi_input") as number) > 0
    : false;

  return isMidi ? "midi" : "audio";
}
