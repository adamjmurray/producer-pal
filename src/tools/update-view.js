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
  highlightedClipSlotId,
  highlightedClipSlot,

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
    highlightedClipSlotId,
    highlightedClipSlot,
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
      songView.set("detail_clip", selectedClipId);
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
    highlightedClipSlotId,
    highlightedClipSlot,
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
  if (highlightedClipSlotId != null)
    result.highlightedClipSlotId = highlightedClipSlotId;
  if (highlightedClipSlot != null)
    result.highlightedClipSlot = highlightedClipSlot;
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
  highlightedClipSlotId,
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

  // Cross-validation for highlighted clip slot ID vs indices
  if (highlightedClipSlotId != null && highlightedClipSlot != null) {
    const { trackIndex, clipSlotIndex } = highlightedClipSlot;
    const clipSlotAPI = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`,
    );
    if (clipSlotAPI.exists() && clipSlotAPI.id !== highlightedClipSlotId) {
      throw new Error(
        "highlightedClipSlotId and highlightedClipSlot refer to different clip slots",
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
    trackAPI = new LiveAPI(selectedTrackId);
    if (trackAPI.exists()) {
      songView.set("selected_track", selectedTrackId);
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
        songView.set("selected_track", finalTrackId);
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
    const sceneAPI = new LiveAPI(selectedSceneId);
    if (sceneAPI.exists()) {
      songView.set("selected_scene", selectedSceneId);
      result.selectedSceneId = selectedSceneId;
      if (selectedSceneIndex != null)
        result.selectedSceneIndex = selectedSceneIndex;
    }
  } else if (selectedSceneIndex != null) {
    // Select by index
    const sceneAPI = new LiveAPI(`live_set scenes ${selectedSceneIndex}`);
    if (sceneAPI.exists()) {
      const sceneId = sceneAPI.id;
      songView.set("selected_scene", sceneId);
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
    // Select specific device by ID
    const deviceAPI = new LiveAPI(selectedDeviceId);
    if (deviceAPI.exists()) {
      // Get the track that contains this device to set it as selected
      const devicePath = deviceAPI.path;
      const trackPathMatch = devicePath.match(
        /(live_set (?:tracks|return_tracks) \d+|live_set master_track)/,
      );
      if (trackPathMatch) {
        const trackPath = trackPathMatch[1];
        const trackAPI = new LiveAPI(trackPath);
        if (trackAPI.exists()) {
          const trackViewPath = `${trackPath} view`;
          const trackView = new LiveAPI(trackViewPath);
          trackView.set("selected_device", selectedDeviceId);
        }
      }
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
      // Find and select the instrument (first device, or first instrument device)
      const devicesAPI = new LiveAPI(`${trackPath} devices`);
      const deviceIds = devicesAPI.getChildIds("devices");

      for (const deviceId of deviceIds) {
        const deviceAPI = new LiveAPI(deviceId);
        if (deviceAPI.exists()) {
          const deviceType = deviceAPI.getProperty("type");
          if (deviceType === 9 || deviceType === 10 || deviceType === 11) {
            // Instrument types
            const trackView = new LiveAPI(`${trackPath} view`);
            trackView.set("selected_device", deviceId);
            break;
          }
        }
      }

      // If no instrument found, select first device
      if (deviceIds.length > 0) {
        const trackView = new LiveAPI(`${trackPath} view`);
        trackView.set("selected_device", deviceIds[0]);
      }
    }
  }
}

function updateHighlightedClipSlot({
  songView,
  highlightedClipSlotId,
  highlightedClipSlot,
}) {
  if (highlightedClipSlotId != null) {
    // Set by ID
    const clipSlotAPI = new LiveAPI(highlightedClipSlotId);
    if (clipSlotAPI.exists()) {
      songView.set("highlighted_clip_slot", highlightedClipSlotId);
    }
  } else if (highlightedClipSlot != null) {
    // Set by indices
    const { trackIndex, clipSlotIndex } = highlightedClipSlot;
    const clipSlotAPI = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`,
    );
    if (clipSlotAPI.exists()) {
      const clipSlotId = clipSlotAPI.id;
      // Ensure ID has proper format for Live API
      const formattedId = clipSlotId.startsWith("id ")
        ? clipSlotId
        : `id ${clipSlotId}`;
      songView.set("highlighted_clip_slot", formattedId);
    }
  }
}
