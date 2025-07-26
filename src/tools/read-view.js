// src/tools/read-view.js
import { fromLiveApiView } from "../utils.js";
import { LIVE_API_VIEW_NAMES } from "./constants.js";

/**
 * Reads the current view state in Ableton Live including which view is active
 * (Session/Arrangement), selected track/scene/clip, and detail view status.
 */
export function readView() {
  const appView = new LiveAPI("live_app view");
  const selectedTrack = new LiveAPI("live_set view selected_track");
  const selectedScene = new LiveAPI("live_set view selected_scene");
  const detailClip = new LiveAPI("live_set view detail_clip");
  const highlightedClipSlotAPI = new LiveAPI(
    "live_set view highlighted_clip_slot",
  );

  // Extract track info using Live API extensions
  const selectedTrackId = selectedTrack.exists() ? selectedTrack.id : null;
  const trackType = selectedTrack.exists() ? selectedTrack.trackType : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedSceneId = selectedScene.exists() ? selectedScene.id : null;
  const selectedClipId = detailClip.exists() ? detailClip.id : null;

  // Get selected device from the selected track's view
  let selectedDeviceId = null;
  if (trackType && selectedTrack.exists()) {
    let trackViewPath;
    if (trackType === "regular") {
      const trackIndex = selectedTrack.trackIndex;
      trackViewPath = `live_set tracks ${trackIndex} view selected_device`;
    } else if (trackType === "return") {
      const returnTrackIndex = selectedTrack.returnTrackIndex;
      trackViewPath = `live_set return_tracks ${returnTrackIndex} view selected_device`;
    } else if (trackType === "master") {
      trackViewPath = "live_set master_track view selected_device";
    }

    if (trackViewPath) {
      const selectedTrackView = new LiveAPI(trackViewPath);
      selectedDeviceId = selectedTrackView.exists()
        ? selectedTrackView.id
        : null;
    }
  }

  const highlightedSlot = highlightedClipSlotAPI.exists()
    ? {
        clipSlotId: highlightedClipSlotAPI.id,
        trackIndex: highlightedClipSlotAPI.trackIndex,
        clipSlotIndex: highlightedClipSlotAPI.sceneIndex,
      }
    : null;

  // Get detail view state by checking visibility
  let detailView = null;

  // Check if detail views are visible
  if (appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_CLIP)) {
    detailView = "clip";
  } else if (
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN)
  ) {
    detailView = "device";
  }

  // Check if browser is visible
  const browserVisible = Boolean(
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.BROWSER),
  );

  // Build selectedTrack object with appropriate index naming
  const selectedTrackObject = {
    trackId: selectedTrackId,
    trackType: trackType,
  };

  // Add appropriate index property based on track type
  if (trackType === "regular" && selectedTrack.exists()) {
    selectedTrackObject.trackIndex = selectedTrack.trackIndex;
  } else if (trackType === "return" && selectedTrack.exists()) {
    selectedTrackObject.returnTrackIndex = selectedTrack.returnTrackIndex;
  }
  // Master track gets no index property

  return {
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    detailView,
    browserVisible,
    selectedTrack: selectedTrackObject,
    selectedClipId,
    selectedDeviceId,
    selectedScene: {
      sceneId: selectedSceneId,
      sceneIndex: selectedSceneIndex,
    },
    highlightedClipSlot: highlightedSlot,
  };
}
