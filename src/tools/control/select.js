import { LIVE_API_VIEW_NAMES } from "../constants.js";
import { fromLiveApiView, toLiveApiView } from "../shared/utils.js";

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
 */
function readViewState() {
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
  if (selectedTrack.exists()) {
    const trackView = new LiveAPI(`${selectedTrack.path} view`);
    if (trackView.exists()) {
      selectedDeviceId =
        trackView.get("selected_device")?.[1]?.toString() || null;
    }
  }

  const highlightedSlot = highlightedClipSlotAPI.exists()
    ? {
        trackIndex: highlightedClipSlotAPI.trackIndex,
        sceneIndex: highlightedClipSlotAPI.sceneIndex,
      }
    : null;

  let detailView = null;
  if (appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_CLIP)) {
    detailView = "clip";
  } else if (
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN)
  ) {
    detailView = "device";
  }

  const browserVisible = Boolean(
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.BROWSER),
  );

  const selectedTrackObject = {
    trackId: selectedTrackId,
    trackType: trackType,
  };

  if (trackType === "regular" && selectedTrack.exists()) {
    selectedTrackObject.trackIndex = selectedTrack.trackIndex;
  } else if (trackType === "return" && selectedTrack.exists()) {
    selectedTrackObject.returnTrackIndex = selectedTrack.returnTrackIndex;
  }
  // master track gets no index property

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
    selectedClipSlot: highlightedSlot,
  };
}

export function select({
  // Main view
  view,

  // Track selection
  trackId,
  trackType,
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
  showDetail,
  showLoop,

  // Browser
  browserVisible,
} = {}) {
  // Validation - throw errors for conflicting parameters
  validateParameters({
    trackId,
    trackType,
    trackIndex,
    sceneId,
    sceneIndex,
    deviceId,
    instrument,
    clipSlot,
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
    trackId,
    trackType,
    trackIndex,
  });

  // Update scene selection
  const sceneSelectionResult = updateSceneSelection({
    songView,
    sceneId,
    sceneIndex,
  });

  // Update clip selection
  if (clipId !== undefined) {
    if (clipId === null) {
      // Deselect all clips
      songView.set("detail_clip", "id 0");
    } else {
      // Select specific clip
      const clipAPI = LiveAPI.from(clipId);
      songView.setProperty("detail_clip", clipAPI.id);
    }
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
  if (showDetail !== undefined) {
    if (showDetail === "clip") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    } else if (showDetail === "device") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN);
    } else if (showDetail === "none") {
      // Hide detail view by hiding the detail view directly
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
  if (browserVisible !== undefined) {
    if (browserVisible) {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.BROWSER);
    } else {
      // Hide browser using hide_view API
      appView.call("hide_view", LIVE_API_VIEW_NAMES.BROWSER);
    }
  }

  // Get current view state as base
  const result = readViewState();

  // If no arguments provided, return current state only
  const hasArgs = Object.values(arguments[0] || {}).some(
    (val) => val !== undefined,
  );
  if (!hasArgs) {
    return result;
  }

  // Apply optimistic updates on top of current state
  if (view != null) result.view = view;

  // Add track selection results
  Object.assign(result, trackSelectionResult);

  // Add scene selection results
  Object.assign(result, sceneSelectionResult);

  if (clipId !== undefined) result.selectedClipId = clipId;
  if (deviceId != null) result.selectedDeviceId = deviceId;
  if (instrument != null) result.instrument = instrument;
  if (clipSlot != null) result.selectedClipSlot = clipSlot;
  if (showDetail !== undefined) {
    result.detailView = showDetail === "none" ? null : showDetail;
  }
  if (showLoop != null) result.showLoop = showLoop;
  if (browserVisible != null) result.browserVisible = browserVisible;

  return result;
}

function validateParameters({
  trackId,
  trackType,
  trackIndex,
  sceneId,
  sceneIndex,
  deviceId,
  instrument,
  clipSlot,
}) {
  // Track selection validation
  if (trackType === "master" && trackIndex != null) {
    throw new Error(
      "trackIndex should not be provided when trackType is 'master'",
    );
  }

  // Device selection validation
  if (deviceId != null && instrument != null) {
    throw new Error("cannot specify both deviceId and instrument");
  }

  // Cross-validation for track ID vs index (requires Live API calls)
  if (trackId != null && trackIndex != null) {
    const finalTrackType = trackType || "regular";
    let trackPath;
    if (finalTrackType === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (finalTrackType === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (finalTrackType === "master") {
      trackPath = "live_set master_track";
    }

    if (trackPath) {
      const trackAPI = new LiveAPI(trackPath);
      if (trackAPI.exists() && trackAPI.id !== trackId) {
        throw new Error("trackId and trackIndex refer to different tracks");
      }
    }
  }

  // Cross-validation for scene ID vs index
  if (sceneId != null && sceneIndex != null) {
    const sceneAPI = new LiveAPI(`live_set scenes ${sceneIndex}`);
    if (sceneAPI.exists() && sceneAPI.id !== sceneId) {
      throw new Error("sceneId and sceneIndex refer to different scenes");
    }
  }
}

function updateTrackSelection({ songView, trackId, trackType, trackIndex }) {
  const result = {};

  // Determine track selection approach
  let trackAPI = null;
  let finalTrackId = trackId;

  if (trackId != null) {
    // Select by ID
    trackAPI = LiveAPI.from(trackId);
    if (trackAPI.exists()) {
      songView.setProperty("selected_track", trackAPI.id);
      result.selectedTrackId = trackId;
      if (trackType != null) result.selectedTrackType = trackType;
      if (trackIndex != null) result.selectedTrackIndex = trackIndex;
    }
  } else if (trackType != null || trackIndex != null) {
    // Select by type/index
    const finalTrackType = trackType || "regular";
    let trackPath;

    if (finalTrackType === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (finalTrackType === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (finalTrackType === "master") {
      trackPath = "live_set master_track";
    }

    if (trackPath) {
      trackAPI = new LiveAPI(trackPath);
      if (trackAPI.exists()) {
        finalTrackId = trackAPI.id;
        songView.setProperty("selected_track", trackAPI.id);
        result.selectedTrackId = finalTrackId;
        result.selectedTrackType = finalTrackType;
        if (finalTrackType !== "master" && trackIndex != null) {
          result.selectedTrackIndex = trackIndex;
        }
      }
    }
  }

  return result;
}

function updateSceneSelection({ songView, sceneId, sceneIndex }) {
  const result = {};

  if (sceneId != null) {
    // Select by ID
    const sceneAPI = LiveAPI.from(sceneId);
    if (sceneAPI.exists()) {
      songView.setProperty("selected_scene", sceneAPI.id);
      result.selectedSceneId = sceneId;
      if (sceneIndex != null) result.selectedSceneIndex = sceneIndex;
    }
  } else if (sceneIndex != null) {
    // Select by index
    const sceneAPI = new LiveAPI(`live_set scenes ${sceneIndex}`);
    if (sceneAPI.exists()) {
      const finalSceneId = sceneAPI.id;
      songView.setProperty("selected_scene", sceneAPI.id);
      result.selectedSceneId = finalSceneId;
      result.selectedSceneIndex = sceneIndex;
    }
  }

  return result;
}

function updateDeviceSelection({ deviceId, instrument, trackSelectionResult }) {
  if (deviceId != null) {
    // Select specific device by ID using the main song view
    const deviceAPI = LiveAPI.from(deviceId);
    if (deviceAPI.exists()) {
      const songView = new LiveAPI("live_set view");
      // Ensure proper "id X" format for select_device call
      const deviceIdStr = deviceId.toString();
      const deviceIdForApi = deviceIdStr.startsWith("id ")
        ? deviceIdStr
        : `id ${deviceIdStr}`;
      songView.call("select_device", deviceIdForApi);
    }
  } else if (instrument === true) {
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

function updateHighlightedClipSlot({ songView, clipSlot }) {
  if (clipSlot != null) {
    // Set by indices
    const { trackIndex, sceneIndex } = clipSlot;
    const clipSlotAPI = new LiveAPI(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );
    if (clipSlotAPI.exists()) {
      songView.setProperty("highlighted_clip_slot", clipSlotAPI.id);
    }
  }
}
