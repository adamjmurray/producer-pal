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

  // Extract indices and IDs from paths
  const selectedTrackIndex = selectedTrack.exists()
    ? selectedTrack.trackIndex
    : null;
  const selectedTrackId = selectedTrack.exists() ? selectedTrack.id : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedSceneId = selectedScene.exists() ? selectedScene.id : null;
  const selectedClipId = detailClip.exists() ? detailClip.id : null;

  // Get selected device from the selected track's view
  let selectedDeviceId = null;
  if (selectedTrackIndex !== null) {
    const selectedTrackView = new LiveAPI(
      `live_set tracks ${selectedTrackIndex} view selected_device`,
    );
    selectedDeviceId = selectedTrackView.exists() ? selectedTrackView.id : null;
  }

  const highlightedSlot = highlightedClipSlotAPI.exists()
    ? {
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

  return {
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    selectedTrackIndex,
    selectedTrackId,
    selectedSceneIndex,
    selectedSceneId,
    selectedClipId,
    selectedDeviceId,
    highlightedClipSlot: highlightedSlot,
    detailView,
    browserVisible,
  };
}
