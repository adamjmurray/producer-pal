// src/tools/update-view.js
import { toLiveApiView } from "../utils.js";
import { LIVE_API_VIEW_SESSION, LIVE_API_VIEW_NAMES } from "./constants.js";

/**
 * Updates the view state in Ableton Live. Use judiciously to avoid interrupting
 * user workflow. Generally only change views when: 1) User explicitly asks to see
 * something, 2) After creating/modifying objects the user specifically asked to
 * work on, 3) Context strongly suggests the user would benefit from seeing the
 * result. When in doubt, don't change views.
 */
export function updateView({
  // Main view
  view,

  // Track selection
  selectedTrackId,
  selectedTrackType,
  selectedTrackIndex,

  // Scene selection
  selectedSceneId,
  selectedSceneIndex,

  // Clip selection
  selectedClipId,

  // Device selection
  selectedDeviceId,
  selectInstrument,

  // Highlighted clip slot
  selectedClipSlot,

  // Detail view
  showDetail,
  showLoop,

  // Browser
  browserVisible,
} = {}) {
  // Validation - throw errors for conflicting parameters
  validateParameters({
    selectedTrackId,
    selectedTrackType,
    selectedTrackIndex,
    selectedSceneId,
    selectedSceneIndex,
    selectedDeviceId,
    selectInstrument,
    selectedClipSlot,
  });

  const appView = new LiveAPI("live_app view");
  const songView = new LiveAPI("live_set view");

  // Update main view (Session/Arrangement)
  if (view != null) {
    appView.call("show_view", toLiveApiView(view));
  }

  // Update track selection
  const trackSelectionResult = updateTrackSelection({
    songView,
    selectedTrackId,
    selectedTrackType,
    selectedTrackIndex,
  });

  // Update scene selection
  const sceneSelectionResult = updateSceneSelection({
    songView,
    selectedSceneId,
    selectedSceneIndex,
  });

  // Update clip selection
  if (selectedClipId !== undefined) {
    if (selectedClipId === null) {
      // Deselect all clips
      songView.set("detail_clip", "id 0");
    } else {
      // Select specific clip
      const clipAPI = LiveAPI.from(selectedClipId);
      songView.setProperty("detail_clip", clipAPI.id);
    }
  }

  // Update device selection
  updateDeviceSelection({
    selectedDeviceId,
    selectInstrument,
    trackSelectionResult,
  });

  // Update highlighted clip slot
  updateHighlightedClipSlot({
    songView,
    selectedClipSlot,
  });

  // Update detail view
  if (showDetail !== undefined) {
    if (showDetail === "clip") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    } else if (showDetail === "device") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN);
    } else if (showDetail === null) {
      // Hide detail view by hiding the detail view directly
      appView.call("hide_view", LIVE_API_VIEW_NAMES.DETAIL);
    }
  }

  // Show loop view for selected clip
  if (showLoop === true && selectedClipId) {
    appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    // Note: There's no direct API to show loop view, but focusing on Detail/Clip
    // with a selected clip will show the clip editor where loop controls are visible
  }

  // Update browser visibility
  if (browserVisible !== undefined) {
    if (browserVisible) {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.BROWSER);
    } else {
      // Hide browser using hide_view API
      appView.call("hide_view", LIVE_API_VIEW_NAMES.BROWSER);
    }
  }

  // Build optimistic result object with only the parameters that were set
  const result = {};
  if (view != null) result.view = view;

  // Add track selection results
  Object.assign(result, trackSelectionResult);

  // Add scene selection results
  Object.assign(result, sceneSelectionResult);

  if (selectedClipId !== undefined) result.selectedClipId = selectedClipId;
  if (selectedDeviceId != null) result.selectedDeviceId = selectedDeviceId;
  if (selectInstrument != null) result.selectInstrument = selectInstrument;
  if (selectedClipSlot != null) result.selectedClipSlot = selectedClipSlot;
  if (showDetail !== undefined)
    result.detailView =
      showDetail === null
        ? null
        : `Detail/${showDetail.charAt(0).toUpperCase() + showDetail.slice(1)}`;
  if (showLoop != null) result.showLoop = showLoop;
  if (browserVisible != null) result.browserVisible = browserVisible;

  return result;
}

function validateParameters({
  selectedTrackId,
  selectedTrackType,
  selectedTrackIndex,
  selectedSceneId,
  selectedSceneIndex,
  selectedDeviceId,
  selectInstrument,
  highlightedClipSlot,
}) {
  // Track selection validation
  if (selectedTrackType === "master" && selectedTrackIndex != null) {
    throw new Error(
      "selectedTrackIndex should not be provided when selectedTrackType is 'master'",
    );
  }

  // Device selection validation
  if (selectedDeviceId != null && selectInstrument != null) {
    throw new Error(
      "cannot specify both selectedDeviceId and selectInstrument",
    );
  }

  // Cross-validation for track ID vs index (requires Live API calls)
  if (selectedTrackId != null && selectedTrackIndex != null) {
    const trackType = selectedTrackType || "regular";
    let trackPath;
    if (trackType === "regular") {
      trackPath = `live_set tracks ${selectedTrackIndex}`;
    } else if (trackType === "return") {
      trackPath = `live_set return_tracks ${selectedTrackIndex}`;
    } else if (trackType === "master") {
      trackPath = "live_set master_track";
    }

    if (trackPath) {
      const trackAPI = new LiveAPI(trackPath);
      if (trackAPI.exists() && trackAPI.id !== selectedTrackId) {
        throw new Error(
          "selectedTrackId and selectedTrackIndex refer to different tracks",
        );
      }
    }
  }

  // Cross-validation for scene ID vs index
  if (selectedSceneId != null && selectedSceneIndex != null) {
    const sceneAPI = new LiveAPI(`live_set scenes ${selectedSceneIndex}`);
    if (sceneAPI.exists() && sceneAPI.id !== selectedSceneId) {
      throw new Error(
        "selectedSceneId and selectedSceneIndex refer to different scenes",
      );
    }
  }
}

function updateTrackSelection({
  songView,
  selectedTrackId,
  selectedTrackType,
  selectedTrackIndex,
}) {
  const result = {};

  // Determine track selection approach
  let trackAPI = null;
  let finalTrackId = selectedTrackId;

  if (selectedTrackId != null) {
    // Select by ID
    trackAPI = LiveAPI.from(selectedTrackId);
    if (trackAPI.exists()) {
      songView.setProperty("selected_track", trackAPI.id);
      result.selectedTrackId = selectedTrackId;
      if (selectedTrackType != null)
        result.selectedTrackType = selectedTrackType;
      if (selectedTrackIndex != null)
        result.selectedTrackIndex = selectedTrackIndex;
    }
  } else if (selectedTrackType != null || selectedTrackIndex != null) {
    // Select by type/index
    const trackType = selectedTrackType || "regular";
    let trackPath;

    if (trackType === "regular") {
      trackPath = `live_set tracks ${selectedTrackIndex}`;
    } else if (trackType === "return") {
      trackPath = `live_set return_tracks ${selectedTrackIndex}`;
    } else if (trackType === "master") {
      trackPath = "live_set master_track";
    }

    if (trackPath) {
      trackAPI = new LiveAPI(trackPath);
      if (trackAPI.exists()) {
        finalTrackId = trackAPI.id;
        songView.setProperty("selected_track", trackAPI.id);
        result.selectedTrackId = finalTrackId;
        result.selectedTrackType = trackType;
        if (trackType !== "master" && selectedTrackIndex != null) {
          result.selectedTrackIndex = selectedTrackIndex;
        }
      }
    }
  }

  return result;
}

function updateSceneSelection({
  songView,
  selectedSceneId,
  selectedSceneIndex,
}) {
  const result = {};

  if (selectedSceneId != null) {
    // Select by ID
    const sceneAPI = LiveAPI.from(selectedSceneId);
    if (sceneAPI.exists()) {
      songView.setProperty("selected_scene", sceneAPI.id);
      result.selectedSceneId = selectedSceneId;
      if (selectedSceneIndex != null)
        result.selectedSceneIndex = selectedSceneIndex;
    }
  } else if (selectedSceneIndex != null) {
    // Select by index
    const sceneAPI = new LiveAPI(`live_set scenes ${selectedSceneIndex}`);
    if (sceneAPI.exists()) {
      const sceneId = sceneAPI.id;
      songView.setProperty("selected_scene", sceneAPI.id);
      result.selectedSceneId = sceneId;
      result.selectedSceneIndex = selectedSceneIndex;
    }
  }

  return result;
}

function updateDeviceSelection({
  selectedDeviceId,
  selectInstrument,
  trackSelectionResult,
}) {
  if (selectedDeviceId != null) {
    // Select specific device by ID using the main song view
    const deviceAPI = LiveAPI.from(selectedDeviceId);
    if (deviceAPI.exists()) {
      const songView = new LiveAPI("live_set view");
      // Ensure proper "id X" format for select_device call
      const deviceIdStr = selectedDeviceId.toString();
      const deviceIdForApi = deviceIdStr.startsWith("id ")
        ? deviceIdStr
        : `id ${deviceIdStr}`;
      songView.call("select_device", deviceIdForApi);
    }
  } else if (selectInstrument === true) {
    // Select instrument on the currently selected or specified track
    let trackPath = null;

    if (trackSelectionResult.selectedTrackType === "regular") {
      trackPath = `live_set tracks ${trackSelectionResult.selectedTrackIndex}`;
    } else if (trackSelectionResult.selectedTrackType === "return") {
      trackPath = `live_set return_tracks ${trackSelectionResult.selectedTrackIndex}`;
    } else if (trackSelectionResult.selectedTrackType === "master") {
      trackPath = "live_set master_track";
    } else {
      // Use currently selected track
      const selectedTrackAPI = new LiveAPI("live_set view selected_track");
      if (selectedTrackAPI.exists()) {
        const trackType = selectedTrackAPI.trackType;
        if (trackType === "regular") {
          trackPath = `live_set tracks ${selectedTrackAPI.trackIndex}`;
        } else if (trackType === "return") {
          trackPath = `live_set return_tracks ${selectedTrackAPI.returnTrackIndex}`;
        } else if (trackType === "master") {
          trackPath = "live_set master_track";
        }
      }
    }

    if (trackPath) {
      // Use the track view's select_instrument function
      const trackView = new LiveAPI(`${trackPath} view`);
      if (trackView.exists()) {
        trackView.call("select_instrument");
      }
    }
  }
}

function updateHighlightedClipSlot({ songView, selectedClipSlot }) {
  if (selectedClipSlot != null) {
    // Set by indices
    const { trackIndex, sceneIndex } = selectedClipSlot;
    const clipSlotAPI = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );
    if (clipSlotAPI.exists()) {
      songView.setProperty("highlighted_clip_slot", clipSlotAPI.id);
    }
  }
}
