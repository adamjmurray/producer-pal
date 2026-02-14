// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface ViewState {
  view: string;
  detailView: string | null;
  showBrowser: boolean;
  selectedTrack: {
    trackId: string | null;
    category: string | null;
    trackIndex?: number | null;
    returnTrackIndex?: number | null;
  };
  selectedClipId: string | null;
  selectedDeviceId: string | null;
  selectedScene: {
    sceneId: string | null;
    sceneIndex: number | null;
  };
  selectedClipSlot: { trackIndex: number; sceneIndex: number } | null;
}

// Constants for Live API paths
const LIVE_APP_VIEW_PATH = "live_app view";
const LIVE_SET_VIEW_PATH = "live_set view";
const LIVE_SET_VIEW_SELECTED_TRACK_PATH = "live_set view selected_track";
const DETAIL_CLIP_VIEW_NAME = "Detail/Clip";
const DETAIL_DEVICE_VIEW_NAME = "Detail/DeviceChain";
const BROWSER_VIEW_NAME = "Browser";

/**
 * Register app view mock (live_app view)
 * @param options - Property overrides
 * @param options.currentView - Current view ("session" or "arrangement")
 * @param options.isDetailClipVisible - Whether detail clip view is visible
 * @param options.isDetailDeviceVisible - Whether detail device view is visible
 * @param options.showBrowser - Whether browser is shown
 * @returns Registered app view mock
 */
export function setupAppViewMock(
  options: {
    currentView?: "session" | "arrangement";
    isDetailClipVisible?: boolean;
    isDetailDeviceVisible?: boolean;
    showBrowser?: boolean;
  } = {},
): RegisteredMockObject {
  const {
    currentView = "session",
    isDetailClipVisible = false,
    isDetailDeviceVisible = false,
    showBrowser = false,
  } = options;

  return registerMockObject("app-view", {
    path: LIVE_APP_VIEW_PATH,
    type: "Application.View",
    properties: {
      focused_document_view: currentView === "session" ? "Session" : "Arranger",
    },
    methods: {
      show_view: () => 0,
      focus_view: () => 0,
      hide_view: () => 0,
      is_view_visible: (...args: unknown[]) => {
        const view = args[0] as string;

        if (view === DETAIL_CLIP_VIEW_NAME && isDetailClipVisible) return 1;

        if (view === DETAIL_DEVICE_VIEW_NAME && isDetailDeviceVisible) return 1;

        if (view === BROWSER_VIEW_NAME && showBrowser) return 1;

        return 0;
      },
    },
  });
}

/**
 * Register song view mock (live_set view)
 * @returns Registered song view mock
 */
export function setupSongViewMock(): RegisteredMockObject {
  return registerMockObject("song-view", {
    path: LIVE_SET_VIEW_PATH,
    type: "Song.View",
    methods: {
      select_device: () => null,
    },
  });
}

/**
 * Register selected track mock or non-existent mock
 * @param options - Track properties
 * @param options.exists - Whether track exists
 * @param options.category - Track category
 * @param options.trackIndex - Track index for regular tracks
 * @param options.returnTrackIndex - Track index for return tracks
 * @param options.id - Track ID
 * @param options.path - Track path
 * @returns Registered mock
 */
export function setupSelectedTrackMock(options?: {
  exists?: boolean;
  category?: "regular" | "return" | "master";
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  id?: string;
  path?: string;
}): RegisteredMockObject {
  const {
    exists = false,
    category = "regular",
    trackIndex = null,
    returnTrackIndex = null,
    id = exists ? "selected-track" : "0",
    path = exists
      ? category === "master"
        ? "live_set master_track"
        : category === "return"
          ? `live_set return_tracks ${returnTrackIndex}`
          : `live_set tracks ${trackIndex}`
      : LIVE_SET_VIEW_SELECTED_TRACK_PATH,
  } = options ?? {};

  return registerMockObject(id, {
    path: LIVE_SET_VIEW_SELECTED_TRACK_PATH,
    type: "Track",
    // Return actual track path from .path getter (instead of registered path)
    returnPath: exists ? path : undefined,
    properties: {
      category: exists ? category : null,
      trackIndex: exists ? trackIndex : null,
      returnTrackIndex: exists ? returnTrackIndex : null,
    },
  });
}

/**
 * Register session clip mock with automatic clip slot setup
 * @param clipId - Clip ID
 * @param trackIndex - Track index
 * @param clipSlotIndex - Clip slot index
 * @param properties - Additional clip properties
 * @returns Object with clip and clipSlot mocks
 */
export function setupSessionClipMock(
  clipId: string,
  trackIndex: number,
  clipSlotIndex: number,
  properties: Record<string, unknown> = {},
): { clip: RegisteredMockObject; clipSlot: RegisteredMockObject } {
  const clip = registerMockObject(clipId, {
    path: `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex} clip`,
    type: "Clip",
    properties: {
      trackIndex,
      clipSlotIndex,
      ...properties,
    },
  });

  const clipSlot = registerMockObject(
    `clipslot-${trackIndex}-${clipSlotIndex}`,
    {
      path: `live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`,
      type: "ClipSlot",
    },
  );

  return { clip, clipSlot };
}

/**
 * Register track view mock for device selection
 * @param trackPath - Track path (e.g., "live_set tracks 0")
 * @param selectedDeviceId - Currently selected device ID
 * @returns Registered track view mock
 */
export function setupTrackViewMock(
  trackPath: string,
  selectedDeviceId?: string,
): RegisteredMockObject {
  return registerMockObject(`track-view-${trackPath}`, {
    path: `${trackPath} view`,
    type: "Track.View",
    properties: {
      selected_device: selectedDeviceId ? ["id", selectedDeviceId] : null,
    },
    methods: {
      select_instrument: () => null,
    },
  });
}

/**
 * Register device mock with path information
 * @param deviceId - Device ID
 * @param devicePath - Device path (e.g., "live_set tracks 0 devices 0")
 * @returns Registered device mock
 */
export function setupDeviceMock(
  deviceId: string,
  devicePath: string,
): RegisteredMockObject {
  return registerMockObject(deviceId, {
    path: devicePath,
    type: "Device",
  });
}

interface ViewStateMockOptions {
  view?: "session" | "arrangement";
  detailView?: "clip" | "device" | null;
  showBrowser?: boolean;
  selectedTrack?: Parameters<typeof setupSelectedTrackMock>[0];
  selectedScene?: { exists: boolean; sceneIndex?: number; id?: string };
  selectedClip?: { exists: boolean; id?: string };
  highlightedClipSlot?: {
    exists: boolean;
    trackIndex?: number;
    sceneIndex?: number;
  };
}

/**
 * Set up complete view state for read-only select() testing
 * @param state - View state configuration
 * @returns Object with all registered mocks
 */
export function setupViewStateMock(state: ViewStateMockOptions): {
  appView: RegisteredMockObject;
  songView: RegisteredMockObject;
  selectedTrack: RegisteredMockObject;
  selectedScene: RegisteredMockObject;
  selectedClip: RegisteredMockObject;
  highlightedClipSlot: RegisteredMockObject;
} {
  const appView = setupAppViewMock({
    currentView: state.view,
    isDetailClipVisible: state.detailView === "clip",
    isDetailDeviceVisible: state.detailView === "device",
    showBrowser: state.showBrowser,
  });

  const songView = setupSongViewMock();
  const selectedTrack = setupSelectedTrackMock(state.selectedTrack);

  const sceneExists = state.selectedScene?.exists ?? false;
  const clipExists = state.selectedClip?.exists ?? false;

  const selectedScene = registerMockObject(
    state.selectedScene?.id ?? (sceneExists ? "selected-scene" : "0"),
    {
      path: "live_set view selected_scene",
      type: "Scene",
      properties: {
        sceneIndex: sceneExists ? state.selectedScene?.sceneIndex : null,
      },
    },
  );

  const selectedClip = registerMockObject(
    state.selectedClip?.id ?? (clipExists ? "selected-clip" : "0"),
    {
      path: "live_set view detail_clip",
      type: "Clip",
    },
  );

  const highlightedClipSlot = registerMockObject(
    state.highlightedClipSlot?.exists
      ? `clipslot-${state.highlightedClipSlot.trackIndex}-${state.highlightedClipSlot.sceneIndex}`
      : "0",
    {
      path: "live_set view highlighted_clip_slot",
      type: "ClipSlot",
      properties: {
        trackIndex: state.highlightedClipSlot?.exists
          ? state.highlightedClipSlot.trackIndex
          : null,
        sceneIndex: state.highlightedClipSlot?.exists
          ? state.highlightedClipSlot.sceneIndex
          : null,
      },
    },
  );

  return {
    appView,
    songView,
    selectedTrack,
    selectedScene,
    selectedClip,
    highlightedClipSlot,
  };
}

/**
 * Returns the expected default view state for select() results.
 * @returns Default view state object
 */
export function getDefaultViewState(): ViewState {
  return {
    view: "session",
    detailView: null,
    showBrowser: false,
    selectedTrack: {
      trackId: null,
      category: null,
    },
    selectedClipId: null,
    selectedDeviceId: null,
    selectedScene: {
      sceneId: null,
      sceneIndex: null,
    },
    selectedClipSlot: null,
  };
}

/**
 * Helper function to merge expected changes with default view state.
 * @param changes - Properties to override in the default state
 * @returns Merged view state object
 */
export function expectViewState(changes: Partial<ViewState> = {}): ViewState {
  return {
    ...getDefaultViewState(),
    ...changes,
  };
}
