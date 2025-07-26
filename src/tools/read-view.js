// src/tools/read-view.js
import { fromLiveApiView } from "../utils.js";

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

  // Extract indices from paths
  const selectedTrackIndex = selectedTrack.exists()
    ? selectedTrack.trackIndex
    : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedClipId = detailClip.exists() ? detailClip.id : null;
  const highlightedSlot = highlightedClipSlotAPI.exists()
    ? {
        trackIndex: highlightedClipSlotAPI.trackIndex,
        clipSlotIndex: highlightedClipSlotAPI.sceneIndex,
      }
    : null;

  // Get detail view state
  const focusedView = appView.getProperty("focused_document_view");
  let detailView = null;

  // Check if detail view is visible by examining the focused view
  if (focusedView === 3) {
    // Detail/Clip view
    detailView = "Detail/Clip";
  } else if (focusedView === 4) {
    // Detail/Device view
    detailView = "Detail/Device";
  }

  return {
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    selectedTrackIndex,
    selectedSceneIndex,
    selectedClipId,
    highlightedClipSlot: highlightedSlot,
    detailView,
  };
}
