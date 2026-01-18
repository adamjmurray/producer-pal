import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.js";
import { fromLiveApiView, toLiveApiView } from "#src/tools/shared/utils.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";

const MASTER_TRACK_PATH = "live_set master_track";

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
 * @param {object} args - The parameters
 * @param {string} [args.view] - Main view to switch to ('session' or 'arrangement')
 * @param {string} [args.trackId] - Track ID to select
 * @param {string} [args.category] - Track category ('regular', 'return', or 'master')
 * @param {number} [args.trackIndex] - Track index (0-based)
 * @param {string} [args.sceneId] - Scene ID to select
 * @param {number} [args.sceneIndex] - Scene index (0-based)
 * @param {string|null} [args.clipId] - Clip ID to select (null to deselect all clips)
 * @param {string} [args.deviceId] - Device ID to select
 * @param {boolean} [args.instrument] - Select the track's instrument
 * @param {{ trackIndex: number, sceneIndex: number }} [args.clipSlot] - Clip slot to highlight
 * @param {string} [args.detailView] - Detail view to show ('clip', 'device', or 'none')
 * @param {boolean} [args.showLoop] - Show loop view for selected clip
 * @param {boolean} [args.showBrowser] - Show browser view
 * @param {object} _context - Context from main (unused)
 * @returns {object} Current view state with selection information
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
  } = {},
  _context = {},
) {
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

  const appView = LiveAPI.from("live_app view");
  const songView = LiveAPI.from("live_set view");

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

/**
 * Build track path string based on category and index
 *
 * @param {string | null} [category] - Track category ('regular', 'return', or 'master')
 * @param {number | null} [trackIndex] - Track index (0-based)
 * @returns {string|null} Track path string or null if invalid category
 */
function buildTrackPath(category, trackIndex) {
  const finalCategory = category || "regular";

  if (finalCategory === "regular") {
    return `live_set tracks ${trackIndex}`;
  }

  if (finalCategory === "return") {
    return `live_set return_tracks ${trackIndex}`;
  }

  if (finalCategory === "master") {
    return MASTER_TRACK_PATH;
  }

  return null;
}

/**
 * Validate selection parameters for conflicts
 *
 * @param {object} options - Parameters object
 * @param {string} [options.trackId] - Track ID
 * @param {string} [options.category] - Track category
 * @param {number} [options.trackIndex] - Track index
 * @param {string} [options.sceneId] - Scene ID
 * @param {number} [options.sceneIndex] - Scene index
 * @param {string} [options.deviceId] - Device ID
 * @param {boolean} [options.instrument] - Instrument selection flag
 * @param {object} [options.clipSlot] - Clip slot coordinates
 */
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
    const trackPath = buildTrackPath(category, trackIndex);

    if (trackPath) {
      const trackAPI = LiveAPI.from(trackPath);

      if (trackAPI.exists() && trackAPI.id !== trackId) {
        throw new Error("trackId and trackIndex refer to different tracks");
      }
    }
  }

  // Cross-validation for scene ID vs index
  if (sceneId != null && sceneIndex != null) {
    const sceneAPI = LiveAPI.from(`live_set scenes ${sceneIndex}`);

    if (sceneAPI.exists() && sceneAPI.id !== sceneId) {
      throw new Error("sceneId and sceneIndex refer to different scenes");
    }
  }
}

/**
 * @typedef {object} TrackSelectionResult
 * @property {string} [selectedTrackId] - Selected track ID
 * @property {string} [selectedCategory] - Track category
 * @property {number} [selectedTrackIndex] - Track index
 */

/**
 * Update track selection in Live
 *
 * @param {object} options - Selection parameters
 * @param {LiveAPI} options.songView - LiveAPI instance for live_set view
 * @param {string} [options.trackId] - Track ID to select
 * @param {string} [options.category] - Track category
 * @param {number} [options.trackIndex] - Track index
 * @returns {TrackSelectionResult} Selection result with track info
 */
function updateTrackSelection({ songView, trackId, category, trackIndex }) {
  /** @type {TrackSelectionResult} */
  const result = {};

  // Determine track selection approach
  let trackAPI = null;
  let finalTrackId = trackId;

  if (trackId != null) {
    // Select by ID and validate it's a track
    trackAPI = validateIdType(trackId, "track", "select");
    songView.setProperty("selected_track", trackAPI.id);
    result.selectedTrackId = trackId;

    if (category != null) {
      result.selectedCategory = category;
    }

    if (trackIndex != null) {
      result.selectedTrackIndex = trackIndex;
    }
  } else if (category != null || trackIndex != null) {
    // Select by category/index
    const finalCategory = category || "regular";
    const trackPath = buildTrackPath(category, trackIndex);

    if (trackPath) {
      trackAPI = LiveAPI.from(trackPath);

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

/**
 * Update scene selection in Live
 *
 * @param {object} options - Selection parameters
 * @param {LiveAPI} options.songView - LiveAPI instance for live_set view
 * @param {string} [options.sceneId] - Scene ID to select
 * @param {number} [options.sceneIndex] - Scene index
 * @returns {object} Selection result with scene info
 */
function updateSceneSelection({ songView, sceneId, sceneIndex }) {
  const result = {};

  if (sceneId != null) {
    // Select by ID and validate it's a scene
    const sceneAPI = validateIdType(sceneId, "scene", "select");

    songView.setProperty("selected_scene", sceneAPI.id);
    result.selectedSceneId = sceneId;

    if (sceneIndex != null) {
      result.selectedSceneIndex = sceneIndex;
    }
  } else if (sceneIndex != null) {
    // Select by index
    const sceneAPI = LiveAPI.from(`live_set scenes ${sceneIndex}`);

    if (sceneAPI.exists()) {
      const finalSceneId = sceneAPI.id;

      songView.setProperty("selected_scene", sceneAPI.id);
      result.selectedSceneId = finalSceneId;
      result.selectedSceneIndex = sceneIndex;
    }
  }

  return result;
}

/**
 * Update device selection in Live
 *
 * @param {object} options - Selection parameters
 * @param {string} [options.deviceId] - Device ID to select
 * @param {boolean} [options.instrument] - Whether to select instrument
 * @param {TrackSelectionResult} options.trackSelectionResult - Previous track selection result
 */
function updateDeviceSelection({ deviceId, instrument, trackSelectionResult }) {
  if (deviceId != null) {
    // Select specific device by ID and validate it's a device
    const _deviceAPI = validateIdType(deviceId, "device", "select");
    const songView = LiveAPI.from("live_set view");
    // Ensure proper "id X" format for select_device call
    const deviceIdStr = deviceId.toString();
    const deviceIdForApi = deviceIdStr.startsWith("id ")
      ? deviceIdStr
      : `id ${deviceIdStr}`;

    songView.call("select_device", deviceIdForApi);
  } else if (instrument === true) {
    // Select instrument on the currently selected or specified track
    let trackPath = buildTrackPath(
      trackSelectionResult.selectedCategory,
      trackSelectionResult.selectedTrackIndex,
    );

    if (!trackPath) {
      // Use currently selected track
      const selectedTrackAPI = LiveAPI.from("live_set view selected_track");

      if (selectedTrackAPI.exists()) {
        const category = selectedTrackAPI.category;
        const trackIndex =
          category === "return"
            ? selectedTrackAPI.returnTrackIndex
            : selectedTrackAPI.trackIndex;

        trackPath = buildTrackPath(category, trackIndex);
      }
    }

    if (trackPath) {
      // Use the track view's select_instrument function
      const trackView = LiveAPI.from(`${trackPath} view`);

      if (trackView.exists()) {
        trackView.call("select_instrument");
      }
    }
  }
}

/**
 * Update highlighted clip slot in Live
 *
 * @param {object} options - Selection parameters
 * @param {LiveAPI} options.songView - LiveAPI instance for live_set view
 * @param {{ trackIndex: number, sceneIndex: number }} [options.clipSlot] - Clip slot coordinates
 */
function updateHighlightedClipSlot({ songView, clipSlot }) {
  if (clipSlot != null) {
    // Set by indices
    const { trackIndex, sceneIndex } = clipSlot;
    const clipSlotAPI = LiveAPI.from(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );

    if (clipSlotAPI.exists()) {
      songView.setProperty("highlighted_clip_slot", clipSlotAPI.id);
    }
  }
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
 * @returns {object} Current view state with all selection information
 */
function readViewState() {
  const appView = LiveAPI.from("live_app view");
  const selectedTrack = LiveAPI.from("live_set view selected_track");
  const selectedScene = LiveAPI.from("live_set view selected_scene");
  const detailClip = LiveAPI.from("live_set view detail_clip");
  const highlightedClipSlotAPI = LiveAPI.from(
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
    const trackView = LiveAPI.from(`${selectedTrack.path} view`);

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

  /** @type {{ trackId: string | null, category: "regular" | "return" | "master" | null, trackIndex?: number | null, returnTrackIndex?: number | null }} */
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
    view: fromLiveApiView(
      /** @type {string} */ (appView.getProperty("focused_document_view")),
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
