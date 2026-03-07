// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { fromLiveApiView, toLiveApiView } from "#src/tools/shared/utils.ts";
import {
  applyDetailView,
  updateClipSelection,
  updateClipSlotSelection,
  updateDeviceSelection,
  updateSceneSelection,
  updateTrackSelection,
  validateParameters,
  type DetectedType,
  type TrackCategory,
} from "./select-helpers.ts";
import {
  determineAutoDetailView,
  parseClipSlot,
  resolveIdParam,
} from "./select-id-helpers.ts";

interface ApplyViewChangesOptions {
  appView: LiveAPI;
  detailView?: "clip" | "device" | "none";
  clipId?: string;
  deviceId?: string;
  devicePath?: string;
  clipSlotHasClip: boolean;
  viewOnly: boolean;
  isReadOnly: boolean;
}

/**
 * Apply detail view changes and auto-close browser on any selection
 * @param options - View change parameters
 * @param options.appView - LiveAPI instance for live_app view
 * @param options.detailView - Explicit detail view override (from internal callers)
 * @param options.clipId - Selected clip ID
 * @param options.deviceId - Selected device ID
 * @param options.devicePath - Selected device path
 * @param options.clipSlotHasClip - Whether the selected clip slot contains a clip
 * @param options.viewOnly - Whether only the view param was provided
 * @param options.isReadOnly - Whether this is a read-only call (no args)
 */
function applyViewChanges({
  appView,
  detailView,
  clipId,
  deviceId,
  devicePath,
  clipSlotHasClip,
  viewOnly,
  isReadOnly,
}: ApplyViewChangesOptions): void {
  const effectiveDetailView =
    detailView ??
    determineAutoDetailView({
      clipId,
      deviceId,
      devicePath,
      clipSlotHasClip,
      viewOnly,
    });

  if (effectiveDetailView != null) {
    applyDetailView({ appView, detailView: effectiveDetailView });
  }

  if (!isReadOnly) {
    appView.call("hide_view", LIVE_API_VIEW_NAMES.BROWSER);
  }
}

interface SelectArgs {
  // External params (from schema)
  id?: string;
  view?: "session" | "arrangement";
  category?: TrackCategory;
  trackIndex?: number;
  sceneIndex?: number;
  clipSlot?: string;
  devicePath?: string;

  // Internal-only params (used by other tools calling select() directly)
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  detailView?: "clip" | "device" | "none";
}

interface SelectedTrackObject {
  trackId: string | null;
  type: string | null;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
}

interface ViewState {
  view: string;
  detailView: "clip" | "device" | null;
  selectedTrack: SelectedTrackObject;
  selectedClipId: string | null;
  selectedDeviceId: string | null;
  selectedScene: {
    sceneId: string | null;
    sceneIndex: number | null;
  };
  selectedClipSlot: { trackIndex: number; sceneIndex: number } | null;
  detectedType?: DetectedType;
}

/**
 * Reads or updates the view state and selection in Ableton Live.
 *
 * When called with no arguments, returns the current view state.
 * When called with arguments, updates the view/selection and returns the state.
 *
 * @param args - The parameters
 * @param _context - Context from main (unused)
 * @returns Current view state with selection information
 */
export function select(
  args: SelectArgs = {},
  _context: Partial<ToolContext> = {},
): ViewState {
  const resolved = resolveArgs(args);
  const { view, category, trackIndex, devicePath, detailView } = args;
  const { trackId, sceneId, clipId, deviceId, parsedClipSlot } = resolved;

  // Validation
  validateParameters({
    trackId,
    category,
    trackIndex,
    sceneId,
    sceneIndex: args.sceneIndex,
    deviceId,
    devicePath,
    clipSlot: parsedClipSlot,
  });

  const appView = LiveAPI.from(livePath.view.app);
  const songView = LiveAPI.from(livePath.view.song);

  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
  }

  // Auto-switch to session view for scene/clipSlot (session-only concepts)
  // unless the user explicitly provided a view param
  if (
    view == null &&
    (sceneId != null || args.sceneIndex != null || parsedClipSlot != null)
  ) {
    appView.call("show_view", toLiveApiView("session"));
  }

  // Update selections
  updateTrackSelection({ songView, trackId, category, trackIndex });
  updateSceneSelection({ songView, sceneId, sceneIndex: args.sceneIndex });

  if (clipId !== undefined) {
    updateClipSelection({ appView, songView, clipId, requestedView: view });
  }

  updateDeviceSelection({ songView, deviceId, devicePath });

  const clipSlotHasClip =
    parsedClipSlot != null &&
    updateClipSlotSelection({ songView, clipSlot: parsedClipSlot });

  // Apply detail view and auto-close browser
  applyViewChanges({
    appView,
    detailView,
    clipId,
    deviceId,
    devicePath,
    clipSlotHasClip,
    viewOnly: resolved.viewOnly,
    isReadOnly: !resolved.hasArgs,
  });

  const result = readViewState();

  if (resolved.detectedType != null) {
    result.detectedType = resolved.detectedType;
  }

  return result;
}

interface ResolvedArgs {
  trackId?: string;
  sceneId?: string;
  clipId?: string;
  deviceId?: string;
  parsedClipSlot?: { trackIndex: number; sceneIndex: number };
  detectedType?: DetectedType;
  hasArgs: boolean;
  viewOnly: boolean;
}

/**
 * Resolve external params (id, clipSlot string) to internal representations
 * @param args - Raw select arguments
 * @returns Resolved arguments with ID type detection and parsed clipSlot
 */
function resolveArgs(args: SelectArgs): ResolvedArgs {
  let { trackId, sceneId, clipId, deviceId } = args;
  let detectedType: DetectedType | undefined;

  if (args.id != null) {
    const resolved = resolveIdParam(args.id);

    detectedType = resolved.detectedType;
    trackId = resolved.trackId ?? trackId;
    sceneId = resolved.sceneId ?? sceneId;
    clipId = resolved.clipId ?? clipId;
    deviceId = resolved.deviceId ?? deviceId;
  }

  const parsedClipSlot =
    typeof args.clipSlot === "string"
      ? parseClipSlot(args.clipSlot)
      : undefined;

  const hasSelectionArgs =
    trackId != null ||
    sceneId != null ||
    clipId != null ||
    deviceId != null ||
    args.devicePath != null ||
    parsedClipSlot != null;

  const hasArgs = hasSelectionArgs || args.view != null;
  const viewOnly = args.view != null && !hasSelectionArgs;

  return {
    trackId,
    sceneId,
    clipId,
    deviceId,
    parsedClipSlot,
    detectedType,
    hasArgs,
    viewOnly,
  };
}

/**
 * Reads the current view state from Ableton Live.
 * @returns Current view state with all selection information
 */
function readViewState(): ViewState {
  const appView = LiveAPI.from(livePath.view.app);
  const selectedTrack = LiveAPI.from(livePath.view.selectedTrack);
  const selectedScene = LiveAPI.from(livePath.view.selectedScene);
  const detailClip = LiveAPI.from(livePath.view.detailClip);
  const highlightedClipSlotAPI = LiveAPI.from(
    livePath.view.highlightedClipSlot,
  );

  // Extract track info using Live API extensions
  const selectedTrackId = selectedTrack.exists()
    ? String(selectedTrack.id)
    : null;
  const category = selectedTrack.exists()
    ? (selectedTrack.category as TrackCategory | null)
    : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedSceneId = selectedScene.exists()
    ? String(selectedScene.id)
    : null;
  const selectedClipId = detailClip.exists() ? String(detailClip.id) : null;

  // Get selected device from the selected track's view
  let selectedDeviceId: string | null = null;

  if (selectedTrack.exists()) {
    const trackView = LiveAPI.from(`${selectedTrack.path} view`);

    if (trackView.exists()) {
      const deviceResult = trackView.get("selected_device") as unknown[] | null;

      if (deviceResult?.[1]) {
        selectedDeviceId = String(deviceResult[1]);
      }
    }
  }

  const highlightedSlot =
    highlightedClipSlotAPI.exists() &&
    highlightedClipSlotAPI.trackIndex != null &&
    highlightedClipSlotAPI.sceneIndex != null
      ? {
          trackIndex: highlightedClipSlotAPI.trackIndex,
          sceneIndex: highlightedClipSlotAPI.sceneIndex,
        }
      : null;

  let detailView: "clip" | "device" | null = null;

  if (appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_CLIP)) {
    detailView = "clip";
  } else if (
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN)
  ) {
    detailView = "device";
  }

  const trackType = computeSelectedTrackType(selectedTrack, category);

  const selectedTrackObject: SelectedTrackObject = {
    trackId: selectedTrackId,
    type: trackType,
  };

  if (category === "regular" && selectedTrack.exists()) {
    selectedTrackObject.trackIndex = selectedTrack.trackIndex;
  } else if (category === "return" && selectedTrack.exists()) {
    selectedTrackObject.returnTrackIndex = selectedTrack.returnTrackIndex;
  }
  // master track gets no index property

  return {
    view: fromLiveApiView(
      appView.getProperty("focused_document_view") as string,
    ),
    detailView,
    selectedTrack: selectedTrackObject,
    selectedClipId,
    selectedDeviceId,
    selectedScene: {
      sceneId: selectedSceneId,
      sceneIndex: selectedSceneIndex,
    },
    selectedClipSlot: highlightedSlot,
  };
}

/**
 * Compute merged track type from category and has_midi_input
 * @param track - Selected track LiveAPI object
 * @param category - Internal category: "regular", "return", or "master"
 * @returns Merged type: "midi", "audio", "return", "master", or null
 */
function computeSelectedTrackType(
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
