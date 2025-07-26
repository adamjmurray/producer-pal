// src/tools/update-view.js
import { toLiveApiView } from "../utils.js";
import { LIVE_API_VIEW_SESSION } from "./constants.js";

/**
 * Updates the view state in Ableton Live. Use judiciously to avoid interrupting
 * user workflow. Generally only change views when: 1) User explicitly asks to see
 * something, 2) After creating/modifying objects the user specifically asked to
 * work on, 3) Context strongly suggests the user would benefit from seeing the
 * result. When in doubt, don't change views.
 */
export function updateView({
  view,
  selectedTrackIndex,
  selectedSceneIndex,
  selectedClipId,
  showDetail,
  showLoop,
} = {}) {
  const appView = new LiveAPI("live_app view");
  const songView = new LiveAPI("live_set view");

  // Update main view (Session/Arrangement)
  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
  }

  // Update track selection
  if (selectedTrackIndex != null) {
    const trackAPI = new LiveAPI("live_set tracks " + selectedTrackIndex);
    if (trackAPI.exists()) {
      songView.set("selected_track", "id " + trackAPI.id);
    }
  }

  // Update scene selection
  if (selectedSceneIndex != null) {
    const sceneAPI = new LiveAPI("live_set scenes " + selectedSceneIndex);
    if (sceneAPI.exists()) {
      songView.set("selected_scene", "id " + sceneAPI.id);
    }
  }

  // Update clip selection
  if (selectedClipId !== undefined) {
    if (selectedClipId === null) {
      // Deselect all clips
      songView.set("detail_clip", "id 0");
    } else {
      // Select specific clip
      songView.set("detail_clip", "id " + selectedClipId);
    }
  }

  // Update detail view
  if (showDetail !== undefined) {
    if (showDetail === "clip") {
      appView.call("focus_view", "Detail/Clip");
    } else if (showDetail === "device") {
      appView.call("focus_view", "Detail/Device");
    } else if (showDetail === null) {
      // Hide detail view by focusing on main view
      if (
        view === "session" ||
        (!view &&
          appView.getProperty("focused_document_view") ===
            LIVE_API_VIEW_SESSION)
      ) {
        appView.call("focus_view", "Session");
      } else {
        appView.call("focus_view", "Arranger");
      }
    }
  }

  // Show loop view for selected clip
  if (showLoop === true && selectedClipId) {
    appView.call("focus_view", "Detail/Clip");
    // Note: There's no direct API to show loop view, but focusing on Detail/Clip
    // with a selected clip will show the clip editor where loop controls are visible
  }

  // Build optimistic result object with only the parameters that were set
  const result = {};
  if (view != null) result.view = view;
  if (selectedTrackIndex != null)
    result.selectedTrackIndex = selectedTrackIndex;
  if (selectedSceneIndex != null)
    result.selectedSceneIndex = selectedSceneIndex;
  if (selectedClipId !== undefined) result.selectedClipId = selectedClipId;
  if (showDetail !== undefined)
    result.detailView =
      showDetail === null
        ? null
        : `Detail/${showDetail.charAt(0).toUpperCase() + showDetail.slice(1)}`;
  if (showLoop != null) result.showLoop = showLoop;

  return result;
}
