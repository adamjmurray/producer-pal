import { LIVE_API_VIEW_NAMES } from "../constants.js";
import { validateIdType } from "../shared/id-validation.js";
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
  const category = selectedTrack.exists() ? selectedTrack.category : null;
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

  const showBrowser = Boolean(
    appView.call("is_view_visible", LIVE_API_VIEW_NAMES.BROWSER),
  );

  const selectedTrackObject = {
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
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
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
 * @param {Object} args - The parameters
 * @param {string} [args.view] - Main view to switch to ('session' or 'arrangement')
 * @param {string} [args.trackId] - Track ID to select
 * @param {string} [args.category] - Track category ('regular', 'return', or 'master')
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {string} [args.sceneId] - Scene ID to select
 * @param {number} [args.sceneIndex] - Scene index (0-based)
 * @param {string|null} [args.clipId] - Clip ID to select (null to deselect all clips)
 * @param {string} [args.deviceId] - Device ID to select
 * @param {boolean} [args.instrument] - Select the track's instrument
 * @param {Object} [args.clipSlot] - Clip slot to highlight {trackIndex, sceneIndex}
 * @param {string} [args.detailView] - Detail view to show ('clip', 'device', or 'none')
 * @param {boolean} [args.showLoop] - Show loop view for selected clip
 * @param {boolean} [args.showBrowser] - Show browser view
 * @returns {Object} Current view state with selection information
 */
export function select({
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
} = {}) {
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
    if (clipId === null) {
      // Deselect all clips
      songView.set("detail_clip", "id 0");
    } else {
      // Select specific clip and validate it's a clip
      const clipAPI = validateIdType(clipId, "clip", "select");
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
  if (detailView !== undefined) {
    if (detailView === "clip") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_CLIP);
    } else if (detailView === "device") {
      appView.call("focus_view", LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN);
    } else if (detailView === "none") {
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

function validateParameters({
  trackId,
  category,
  trackIndex,
  sceneId,
  sceneIndex,
  deviceId,
  instrument,
  clipSlot: _clipSlot,
}) {
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
    const finalCategory = category || "regular";
    let trackPath;
    if (finalCategory === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (finalCategory === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (finalCategory === "master") {
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

function updateTrackSelection({ songView, trackId, category, trackIndex }) {
  const result = {};

  // Determine track selection approach
  let trackAPI = null;
  let finalTrackId = trackId;

  if (trackId != null) {
    // Select by ID and validate it's a track
    trackAPI = validateIdType(trackId, "track", "select");
    songView.setProperty("selected_track", trackAPI.id);
    result.selectedTrackId = trackId;
    if (category != null) result.selectedCategory = category;
    if (trackIndex != null) result.selectedTrackIndex = trackIndex;
  } else if (category != null || trackIndex != null) {
    // Select by category/index
    const finalCategory = category || "regular";
    let trackPath;

    if (finalCategory === "regular") {
      trackPath = `live_set tracks ${trackIndex}`;
    } else if (finalCategory === "return") {
      trackPath = `live_set return_tracks ${trackIndex}`;
    } else if (finalCategory === "master") {
      trackPath = "live_set master_track";
    }

    if (trackPath) {
      trackAPI = new LiveAPI(trackPath);
      if (trackAPI.exists()) {
        finalTrackId = trackAPI.id;
        songView.setProperty("selected_track", trackAPI.id);
        result.selectedTrackId = finalTrackId;
        result.selectedCategory = finalCategory;
        if (finalCategory !== "master" && trackIndex != null) {
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
    // Select by ID and validate it's a scene
    const sceneAPI = validateIdType(sceneId, "scene", "select");
    songView.setProperty("selected_scene", sceneAPI.id);
    result.selectedSceneId = sceneId;
    if (sceneIndex != null) result.selectedSceneIndex = sceneIndex;
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
    // Select specific device by ID and validate it's a device
    const _deviceAPI = validateIdType(deviceId, "device", "select");
    const songView = new LiveAPI("live_set view");
    // Ensure proper "id X" format for select_device call
    const deviceIdStr = deviceId.toString();
    const deviceIdForApi = deviceIdStr.startsWith("id ")
      ? deviceIdStr
      : `id ${deviceIdStr}`;
    songView.call("select_device", deviceIdForApi);
  } else if (instrument === true) {
    // Select instrument on the currently selected or specified track
    let trackPath = null;

    if (trackSelectionResult.selectedCategory === "regular") {
      trackPath = `live_set tracks ${trackSelectionResult.selectedTrackIndex}`;
    } else if (trackSelectionResult.selectedCategory === "return") {
      trackPath = `live_set return_tracks ${trackSelectionResult.selectedTrackIndex}`;
    } else if (trackSelectionResult.selectedCategory === "master") {
      trackPath = "live_set master_track";
    } else {
      // Use currently selected track
      const selectedTrackAPI = new LiveAPI("live_set view selected_track");
      if (selectedTrackAPI.exists()) {
        const category = selectedTrackAPI.category;
        if (category === "regular") {
          trackPath = `live_set tracks ${selectedTrackAPI.trackIndex}`;
        } else if (category === "return") {
          trackPath = `live_set return_tracks ${selectedTrackAPI.returnTrackIndex}`;
        } else if (category === "master") {
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
