import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.js";
import { fromLiveApiView, toLiveApiView } from "#src/tools/shared/utils.js";
import { validateIdType } from "#src/tools/shared/validation/id-validation.js";

const MASTER_TRACK_PATH = "live_set master_track";

type TrackCategory = "regular" | "return" | "master";

interface SelectArgs {
  view?: "session" | "arrangement";
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  clipId?: string | null;
  deviceId?: string;
  instrument?: boolean;
  clipSlot?: { trackIndex: number; sceneIndex: number };
  detailView?: "clip" | "device" | "none";
  showLoop?: boolean;
  showBrowser?: boolean;
}

interface TrackSelectionResult {
  selectedTrackId?: string;
  selectedCategory?: string;
  selectedTrackIndex?: number;
}

interface SceneSelectionResult {
  selectedSceneId?: string;
  selectedSceneIndex?: number;
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

interface ValidateParametersOptions {
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
  sceneId?: string;
  sceneIndex?: number;
  deviceId?: string;
  instrument?: boolean;
  clipSlot?: { trackIndex: number; sceneIndex: number };
}

interface UpdateTrackSelectionOptions {
  songView: LiveAPI;
  trackId?: string;
  category?: TrackCategory;
  trackIndex?: number;
}

interface UpdateSceneSelectionOptions {
  songView: LiveAPI;
  sceneId?: string;
  sceneIndex?: number;
}

interface UpdateDeviceSelectionOptions {
  deviceId?: string;
  instrument?: boolean;
  trackSelectionResult: TrackSelectionResult;
}

interface UpdateHighlightedClipSlotOptions {
  songView: LiveAPI;
  clipSlot?: { trackIndex: number; sceneIndex: number };
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
 * Build track path string based on category and index
 *
 * @param category - Track category ('regular', 'return', or 'master')
 * @param trackIndex - Track index (0-based)
 * @returns Track path string or null if invalid category
 */
function buildTrackPath(
  category?: string | null,
  trackIndex?: number | null,
): string | null {
  const finalCategory = category ?? "regular";

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
 * @param options - Parameters object
 * @param options.trackId - Track ID
 * @param options.category - Track category
 * @param options.trackIndex - Track index
 * @param options.sceneId - Scene ID
 * @param options.sceneIndex - Scene index
 * @param options.deviceId - Device ID
 * @param options.instrument - Instrument selection flag
 * @param options.clipSlot - Clip slot coordinates
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
}: ValidateParametersOptions): void {
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
 * Update track selection in Live
 *
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.trackId - Track ID to select
 * @param options.category - Track category
 * @param options.trackIndex - Track index
 * @returns Selection result with track info
 */
function updateTrackSelection({
  songView,
  trackId,
  category,
  trackIndex,
}: UpdateTrackSelectionOptions): TrackSelectionResult {
  const result: TrackSelectionResult = {};

  // Determine track selection approach
  let trackAPI: LiveAPI | null = null;
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
    const finalCategory = category ?? "regular";
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
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.sceneId - Scene ID to select
 * @param options.sceneIndex - Scene index
 * @returns Selection result with scene info
 */
function updateSceneSelection({
  songView,
  sceneId,
  sceneIndex,
}: UpdateSceneSelectionOptions): SceneSelectionResult {
  const result: SceneSelectionResult = {};

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
 * @param options - Selection parameters
 * @param options.deviceId - Device ID to select
 * @param options.instrument - Whether to select instrument
 * @param options.trackSelectionResult - Previous track selection result
 */
function updateDeviceSelection({
  deviceId,
  instrument,
  trackSelectionResult,
}: UpdateDeviceSelectionOptions): void {
  if (deviceId != null) {
    // Select specific device by ID and validate it's a device
    validateIdType(deviceId, "device", "select");
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
 * @param options - Selection parameters
 * @param options.songView - LiveAPI instance for live_set view
 * @param options.clipSlot - Clip slot coordinates
 */
function updateHighlightedClipSlot({
  songView,
  clipSlot,
}: UpdateHighlightedClipSlotOptions): void {
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
 * @returns Current view state with all selection information
 */
function readViewState(): ViewState {
  const appView = LiveAPI.from("live_app view");
  const selectedTrack = LiveAPI.from("live_set view selected_track");
  const selectedScene = LiveAPI.from("live_set view selected_scene");
  const detailClip = LiveAPI.from("live_set view detail_clip");
  const highlightedClipSlotAPI = LiveAPI.from(
    "live_set view highlighted_clip_slot",
  );

  // Extract track info using Live API extensions
  const selectedTrackId = selectedTrack.exists() ? selectedTrack.id : null;
  const category = selectedTrack.exists()
    ? (selectedTrack.category as TrackCategory | null)
    : null;
  const selectedSceneIndex = selectedScene.exists()
    ? selectedScene.sceneIndex
    : null;
  const selectedSceneId = selectedScene.exists() ? selectedScene.id : null;
  const selectedClipId = detailClip.exists() ? detailClip.id : null;

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
