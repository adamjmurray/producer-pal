// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { toLiveApiId, toLiveApiView } from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";

const MASTER_TRACK_PATH = "live_set master_track";

export type TrackCategory = "regular" | "return" | "master";

export interface TrackSelectionResult {
  selectedTrackId?: string;
  selectedCategory?: string;
  selectedTrackIndex?: number;
}

export interface SceneSelectionResult {
  selectedSceneId?: string;
  selectedSceneIndex?: number;
}

interface ValidateParametersOptions {
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  deviceId?: string;
  instrument?: boolean;
  clipSlot?: { trackIndex: number; sceneIndex: number };
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
  deviceId?: string;
  instrument?: boolean;
  trackSelectionResult: TrackSelectionResult;
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
): string | null {
  const finalCategory = category ?? "regular";

  if (finalCategory === "regular") {
    if (trackIndex == null) {
      return null;
    }

    return `live_set tracks ${trackIndex}`;
  }

  if (finalCategory === "return") {
    if (trackIndex == null) {
      return null;
    }

    return `live_set return_tracks ${trackIndex}`;
  }

  if (finalCategory === "master") {
    return MASTER_TRACK_PATH;
  }

  return null;
}

/**
 * Validate selection parameters for conflicts
 * @param options - Parameters object
 * @param options.trackId - Track ID
 * @param options.category - Track category
 * @param options.trackIndex - Track index
 * @param options.sceneId - Scene ID
 * @param options.sceneIndex - Scene index
 * @param options.deviceId - Device ID
 * @param options.instrument - Instrument flag
 * @param options.clipSlot - Clip slot coordinates
 */
export function validateParameters({
  trackId,
  category,
  trackIndex,
  sceneId,
  sceneIndex,
  deviceId,
  instrument,
  clipSlot: _clipSlot,
}: ValidateParametersOptions): void {
  // Track selection validation
  if (category === "master" && trackIndex != null) {
    throw new Error(
      "trackIndex should not be provided when category is 'master'",
    );
  }

  // Device selection validation
  if (deviceId != null && instrument != null) {
    throw new Error("cannot specify both deviceId and instrument");
  }

  // Cross-validation for track ID vs index (requires Live API calls)
  if (trackId != null && trackIndex != null) {
    const trackPath = buildTrackPath(category, trackIndex);

    if (trackPath) {
      const trackAPI = LiveAPI.from(trackPath);

      if (trackAPI.exists() && !isSameLiveApiId(trackAPI.id, trackId)) {
        throw new Error("trackId and trackIndex refer to different tracks");
      }
    }
  }

  // Cross-validation for scene ID vs index
  if (sceneId != null && sceneIndex != null) {
    const sceneAPI = LiveAPI.from(`live_set scenes ${sceneIndex}`);

    if (sceneAPI.exists() && !isSameLiveApiId(sceneAPI.id, sceneId)) {
      throw new Error("sceneId and sceneIndex refer to different scenes");
    }
  }
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
  let trackAPI: LiveAPI | null = null;

  if (trackId != null) {
    trackAPI = validateIdType(trackId, "track", "select");
    const liveApiTrackId = toLiveApiId(trackAPI.id);

    songView.setProperty("selected_track", liveApiTrackId);
    result.selectedTrackId = liveApiTrackId;

    if (category != null) {
      result.selectedCategory = category;
    }

    if (trackIndex != null) {
      result.selectedTrackIndex = trackIndex;
    }
  } else if (category != null || trackIndex != null) {
    const finalCategory = category ?? "regular";
    const trackPath = buildTrackPath(category, trackIndex);

    if (trackPath) {
      trackAPI = LiveAPI.from(trackPath);

      if (trackAPI.exists()) {
        const liveApiTrackId = toLiveApiId(trackAPI.id);

        songView.setProperty("selected_track", liveApiTrackId);
        result.selectedTrackId = liveApiTrackId;
        result.selectedCategory = finalCategory;

        if (finalCategory !== "master" && trackIndex != null) {
          result.selectedTrackIndex = trackIndex;
        }
      }
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
    const sceneAPI = validateIdType(sceneId, "scene", "select");
    const liveApiSceneId = toLiveApiId(sceneAPI.id);

    songView.setProperty("selected_scene", liveApiSceneId);
    result.selectedSceneId = liveApiSceneId;

    if (sceneIndex != null) {
      result.selectedSceneIndex = sceneIndex;
    }
  } else if (sceneIndex != null) {
    const sceneAPI = LiveAPI.from(`live_set scenes ${sceneIndex}`);

    if (sceneAPI.exists()) {
      const finalSceneId = toLiveApiId(sceneAPI.id);

      songView.setProperty("selected_scene", finalSceneId);
      result.selectedSceneId = finalSceneId;
      result.selectedSceneIndex = sceneIndex;
    }
  }

  return result;
}

/**
 * Update device selection in Live
 * @param options - Selection parameters
 * @param options.deviceId - Device ID to select
 * @param options.instrument - Whether to select instrument
 * @param options.trackSelectionResult - Previous track selection result
 */
export function updateDeviceSelection({
  deviceId,
  instrument,
  trackSelectionResult,
}: UpdateDeviceSelectionOptions): void {
  if (deviceId != null) {
    validateIdType(deviceId, "device", "select");
    const songView = LiveAPI.from("live_set view");

    songView.call("select_device", toLiveApiId(deviceId));
  } else if (instrument === true) {
    let trackPath = buildTrackPath(
      trackSelectionResult.selectedCategory,
      trackSelectionResult.selectedTrackIndex,
    );

    if (!trackPath) {
      const selectedTrackAPI = LiveAPI.from("live_set view selected_track");

      if (selectedTrackAPI.exists()) {
        const category = selectedTrackAPI.category;
        const trackIndex =
          category === "return"
            ? selectedTrackAPI.returnTrackIndex
            : selectedTrackAPI.trackIndex;

        trackPath = buildTrackPath(category, trackIndex);
      }
    }

    if (trackPath) {
      const trackView = LiveAPI.from(`${trackPath} view`);

      if (trackView.exists()) {
        trackView.call("select_instrument");
      }
    }
  }
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
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );

    if (clipSlotAPI.exists()) {
      songView.setProperty(
        "highlighted_clip_slot",
        toLiveApiId(clipSlotAPI.id),
      );
    }
  }
}

interface UpdateClipSelectionOptions {
  appView: LiveAPI;
  songView: LiveAPI;
  clipId: string;
  requestedView?: "session" | "arrangement";
}

/**
 * Update clip selection in Live, switching to the appropriate view
 * @param options - Selection parameters
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.clipId - Clip ID to select
 * @param options.requestedView - User-requested view (may be overridden)
 */
export function updateClipSelection({
  appView,
  songView,
  clipId,
  requestedView,
}: UpdateClipSelectionOptions): void {
  const clipAPI = validateIdType(clipId, "clip", "select");
  const isSessionClip =
    clipAPI.trackIndex != null && clipAPI.clipSlotIndex != null;
  const requiredView = isSessionClip ? "session" : "arrangement";

  // Warn if user explicitly requested a conflicting view
  if (requestedView != null && requestedView !== requiredView) {
    console.warn(
      `Warning: ignoring view="${requestedView}" - clip ${clipId} requires ${requiredView} view`,
    );
  }

  // Switch to appropriate view for the clip type
  // (Live API ignores detail_clip set if in wrong view)
  appView.call("show_view", toLiveApiView(requiredView));

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
}

function normalizeLiveApiId(id: string): string {
  return id.startsWith("id ") ? id.slice(3) : id;
}

function isSameLiveApiId(idA: string, idB: string): boolean {
  return normalizeLiveApiId(idA) === normalizeLiveApiId(idB);
}
