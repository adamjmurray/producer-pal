// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { fromLiveApiView, toLiveApiView } from "#src/tools/shared/utils.ts";
import {
  updateClipSelection,
  updateDeviceSelection,
  updateHighlightedClipSlot,
  updateSceneSelection,
  updateTrackSelection,
  validateParameters,
  type TrackCategory,
} from "./select-helpers.ts";

interface SelectArgs {
  view?: "session" | "arrangement";
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  clipId?: string;
  deviceId?: string;
  instrument?: boolean;
  clipSlot?: { trackIndex: number; sceneIndex: number };
  detailView?: "clip" | "device" | "none";
  showLoop?: boolean;
  showBrowser?: boolean;
}

interface SelectedTrackObject {
  trackId: string | null;
  category: TrackCategory | null;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
}

interface ViewState {
  view: string;
  detailView: "clip" | "device" | null;
  showBrowser: boolean;
  selectedTrack: SelectedTrackObject;
  selectedClipId: string | null;
  selectedDeviceId: string | null;
  selectedScene: {
    sceneId: string | null;
    sceneIndex: number | null;
  };
  selectedClipSlot: { trackIndex: number; sceneIndex: number } | null;
}

/**
 * Reads or updates the view state and selection in Ableton Live.
 *
 * When called with no arguments (or empty object), returns the current view state.
 * When called with arguments, updates the view/selection and returns the full view state
 * with updates optimistically applied.
 *
 * Use update functionality judiciously to avoid interrupting user workflow.
 * Generally only change views when: 1) User explicitly asks to see something,
 * 2) After creating/modifying objects the user specifically asked to work on,
 * 3) Context strongly suggests the user would benefit from seeing the result.
 * When in doubt, don't change views.
 *
 * @param args - The parameters
 * @param args.view - Main view to switch to
 * @param args.trackId - Track ID to select
 * @param args.category - Track category
 * @param args.trackIndex - Track index (0-based)
 * @param args.sceneId - Scene ID to select
 * @param args.sceneIndex - Scene index (0-based)
 * @param args.clipId - Clip ID to select (null to deselect)
 * @param args.deviceId - Device ID to select
 * @param args.instrument - Select the track's instrument
 * @param args.clipSlot - Clip slot to highlight
 * @param args.detailView - Detail view to show
 * @param args.showLoop - Show loop view for selected clip
 * @param args.showBrowser - Show browser view
 * @param _context - Context from main (unused)
 * @returns Current view state with selection information
 */
export function select(
  {
    // Main view
    view,

    // Track selection
    trackId,
    category,
    trackIndex,

    // Scene selection
    sceneId,
    sceneIndex,

    // Clip selection
    clipId,

    // Device selection
    deviceId,
    instrument,

    // Highlighted clip slot
    clipSlot,

    // Detail view
    detailView,
    showLoop,

    // Browser
    showBrowser,
  }: SelectArgs = {},
  _context: Partial<ToolContext> = {},
): ViewState {
  // Validation - throw errors for conflicting parameters
  validateParameters({
    trackId,
    category,
    trackIndex,
    sceneId,
    sceneIndex,
    deviceId,
    instrument,
    clipSlot,
  });

  const appView = LiveAPI.from(livePath.view.app);
  const songView = LiveAPI.from(livePath.view.song);

  // Update main view (Session/Arrangement)
  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
  }

  // Update track selection
  const trackSelectionResult = updateTrackSelection({
    songView,
    trackId,
    category,
    trackIndex,
  });

  // Update scene selection
  updateSceneSelection({
    songView,
    sceneId,
    sceneIndex,
  });

  // Update clip selection
  if (clipId !== undefined) {
    updateClipSelection({
      appView,
      songView,
      clipId,
      requestedView: view,
    });
  }

  // Update device selection
  updateDeviceSelection({
    deviceId,
    instrument,
    trackSelectionResult,
  });

  // Update highlighted clip slot
  updateHighlightedClipSlot({
    songView,
    clipSlot,
  });

  // Update detail view
  if (detailView !== undefined) {
    if (detailView === "clip") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    } else if (detailView === "device") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN);
    } else {
      // Hide detail view by hiding the detail view directly (detailView === "none")
      appView.call("hide_view", LIVE_API_VIEW_NAMES.DETAIL);
    }
  }

  // Show loop view for selected clip
  if (showLoop === true && clipId) {
    appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    // Note: There's no direct API to show loop view, but focusing on Detail/Clip
    // with a selected clip will show the clip editor where loop controls are visible
  }

  // Update browser visibility
  if (showBrowser !== undefined) {
    if (showBrowser) {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.BROWSER);
    } else {
      // Hide browser using hide_view API
      appView.call("hide_view", LIVE_API_VIEW_NAMES.BROWSER);
    }
  }

  // Get current view state after applying updates
  return readViewState();
}

/**
 * Reads or updates the view state in Ableton Live.
 *
 * When called with no arguments (or empty object), returns the current view state.
 * When called with arguments, updates the view and returns the full view state
 * with updates optimistically applied.
 *
 * Use update functionality judiciously to avoid interrupting user workflow.
 * Generally only change views when: 1) User explicitly asks to see something,
 * 2) After creating/modifying objects the user specifically asked to work on,
 * 3) Context strongly suggests the user would benefit from seeing the result.
 * When in doubt, don't change views.
 *
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

  const showBrowser = Boolean(
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.BROWSER),
  );

  const selectedTrackObject: SelectedTrackObject = {
    trackId: selectedTrackId,
    category: category,
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
    showBrowser,
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
