import type { Mock } from "vitest";
// Import for use in helper functions below
import {
  liveApiCall,
  liveApiGet,
  liveApiPath,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

// Re-export mock utilities from mock-live-api for convenience
export {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

/** Default arrangement clip path for testing */
const DEFAULT_ARRANGEMENT_CLIP = "live_set tracks 0 arrangement_clips 0";

/**
 * Setup liveApiPath mock for track duplication tests.
 * @param trackId - Track ID (e.g., "track1")
 * @param trackIndex - Track index (e.g., 0)
 */
export function setupTrackPath(trackId: string, trackIndex = 0): void {
  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === trackId) {
      return `live_set tracks ${trackIndex}`;
    }

    return this._path;
  });
}

/**
 * Setup liveApiPath mock for scene duplication tests (matches by id).
 * @param sceneId - Scene ID (e.g., "scene1")
 * @param sceneIndex - Scene index (e.g., 0)
 */
export function setupScenePath(sceneId: string, sceneIndex = 0): void {
  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === sceneId) {
      return `live_set scenes ${sceneIndex}`;
    }

    return this._path;
  });
}

/**
 * Setup liveApiPath mock for scene tests where LiveAPI.from(sceneId) is used.
 * This handles the case where the instance has _path = sceneId (from LiveAPI.from).
 * @param sceneId - Scene ID used in LiveAPI.from() (e.g., "scene1")
 * @param sceneIndex - Scene index (e.g., 0)
 */
export function setupScenePathFromId(sceneId: string, sceneIndex = 0): void {
  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    // LiveAPI.from(sceneId) creates instance with _path = sceneId
    if (this._path === sceneId) {
      return `live_set scenes ${sceneIndex}`;
    }

    return this._path;
  });
}

/**
 * Setup arrangement clip mocks for scene-to-arrangement tests.
 * Extends existing liveApiPath and liveApiGet mocks to handle arrangement clips.
 * @param opts - Options
 * @param opts.getStartTime - Function to get start time for a path
 */
export function setupArrangementClipMocks(
  opts: { getStartTime?: (path: string) => number } = {},
): void {
  const { getStartTime = () => 16 } = opts;

  const originalGet = (liveApiGet as Mock).getMockImplementation() as
    | ((this: MockLiveAPIContext, prop: string) => unknown[])
    | undefined;
  const originalPath = (liveApiPath as Mock).getMockImplementation() as
    | ((this: MockLiveAPIContext) => string | undefined)
    | undefined;

  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    // For arrangement clips created by ID, return a proper path
    if (
      this._path?.startsWith("id live_set tracks") &&
      this._path.includes("arrangement_clips")
    ) {
      return this._path.slice(3); // Remove "id " prefix
    }

    return originalPath ? originalPath.call(this) : this._path;
  });

  (liveApiGet as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
    prop: string,
  ): unknown[] {
    // Check if this is an arrangement clip requesting is_arrangement_clip
    if (
      this._path?.includes("arrangement_clips") &&
      prop === "is_arrangement_clip"
    ) {
      return [1];
    }

    // Check if this is an arrangement clip requesting start_time
    if (this._path?.includes("arrangement_clips") && prop === "start_time") {
      return [getStartTime(this._path)];
    }

    // Otherwise use the original mock implementation
    return originalGet ? originalGet.call(this, prop) : [];
  });
}

interface SourceTrackMock {
  name: string;
  current_monitoring_state: number;
  input_routing_type: { display_name: string };
  available_input_routing_types: Array<{
    display_name: string;
    identifier: string;
  }>;
  arm?: number;
}

/**
 * Setup mock for routeToSource track tests.
 * @param opts - Options
 * @param opts.trackName - Track name
 * @param opts.monitoringState - Monitoring state value
 * @param opts.inputRoutingName - Input routing name
 * @param opts.arm - Arm state
 * @returns Mock data keyed by track path
 */
export function setupRouteToSourceMock(
  opts: {
    trackName?: string;
    monitoringState?: number;
    inputRoutingName?: string;
    arm?: number;
  } = {},
): Record<string, Record<string, unknown>> {
  const {
    trackName = "Source Track",
    monitoringState = 0,
    inputRoutingName = "No Input",
    arm,
  } = opts;

  const sourceTrackMock: SourceTrackMock = {
    name: trackName,
    current_monitoring_state: monitoringState,
    input_routing_type: { display_name: inputRoutingName },
    available_input_routing_types: [
      { display_name: "No Input", identifier: "no_input_id" },
      { display_name: "Audio In", identifier: "audio_in_id" },
    ],
  };

  if (arm !== undefined) {
    sourceTrackMock.arm = arm;
  }

  return {
    "live_set tracks 0": sourceTrackMock as unknown as Record<string, unknown>,
    "live_set tracks 1": {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: trackName, identifier: "source_track_id" },
      ],
    },
  };
}

/**
 * Setup liveApiPath mock for session clip validation tests.
 * @param clipId - Clip ID (e.g., "clip1")
 * @param clipPath - Clip path (default: "live_set tracks 0 clip_slots 0 clip")
 */
export function setupSessionClipPath(
  clipId: string,
  clipPath = "live_set tracks 0 clip_slots 0 clip",
): void {
  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === clipId) return clipPath;

    return this._path;
  });
}

/**
 * Setup liveApiCall mock for arrangement clip duplication.
 * Handles duplicate_clip_to_arrangement and get_notes_extended methods.
 * @param opts - Options
 * @param opts.returnClipId - Clip ID to return
 * @param opts.includeNotes - Whether to include notes
 */
export function setupArrangementDuplicationMock(
  opts: { returnClipId?: string; includeNotes?: boolean } = {},
): void {
  const { returnClipId = DEFAULT_ARRANGEMENT_CLIP, includeNotes = true } = opts;

  (liveApiCall as Mock).mockImplementation(function (
    method: string,
  ): string[] | string | null {
    if (method === "duplicate_clip_to_arrangement") {
      return ["id", returnClipId];
    }

    if (includeNotes && method === "get_notes_extended") {
      return JSON.stringify({ notes: [] });
    }

    return null;
  });
}

/**
 * Returns mock data for a standard MIDI clip used in scene duplication tests.
 * @param opts - Options
 * @param opts.length - Clip length
 * @param opts.name - Clip name
 * @returns Mock data object for the clip
 */
export function createStandardMidiClipMock(
  opts: { length?: number; name?: string } = {},
): Record<string, unknown> {
  const { length = 8, name = "Scene Clip" } = opts;

  return {
    length,
    name,
    color: 4047616,
    signature_numerator: 4,
    signature_denominator: 4,
    looping: 0,
    loop_start: 0,
    loop_end: length,
    is_midi_clip: 1,
  };
}

/**
 * Setup mocks for device duplication tests.
 * @param deviceId - Device ID
 * @param devicePath - Device path
 * @param deviceType - Device type
 */
export function setupDeviceDuplicationMocks(
  deviceId: string,
  devicePath: string,
  deviceType = "PluginDevice",
): void {
  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === deviceId) {
      return devicePath;
    }

    return this._path;
  });

  (liveApiType as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === deviceId) {
      return deviceType;
    }
  });
}

/**
 * Create expected track duplication result object.
 * @param trackIndex - Track index in result
 * @returns Expected result
 */
export function createTrackResult(trackIndex: number): {
  id: string;
  trackIndex: number;
  clips: unknown[];
} {
  return {
    id: `live_set/tracks/${trackIndex}`,
    trackIndex,
    clips: [],
  };
}

/**
 * Create expected array of track duplication results.
 * @param startIndex - Starting track index
 * @param count - Number of tracks
 * @returns Expected results array
 */
export function createTrackResultArray(
  startIndex: number,
  count: number,
): Array<{ id: string; trackIndex: number; clips: unknown[] }> {
  return Array.from({ length: count }, (_, i) =>
    createTrackResult(startIndex + i),
  );
}

/**
 * Setup mock for time signature duration conversion tests.
 * @param opts - Options
 * @param opts.clipId - Clip ID
 * @param opts.clipPath - Clip path
 */
export function setupTimeSignatureDurationMock(
  opts: { clipId?: string; clipPath?: string } = {},
): void {
  const { clipId = "clip1", clipPath = "live_set tracks 0 clip_slots 0 clip" } =
    opts;

  (liveApiPath as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    if (this._id === clipId) {
      return clipPath;
    }

    if (this._path === `id ${DEFAULT_ARRANGEMENT_CLIP}`) {
      return DEFAULT_ARRANGEMENT_CLIP;
    }

    return this._path;
  });

  (liveApiCall as Mock).mockImplementation(function (
    this: MockLiveAPIContext,
    method: string,
  ): string[] | string | null {
    if (method === "create_midi_clip") {
      let trackIndex = "0";

      if (this.path) {
        const trackMatch = this.path.match(/live_set tracks (\d+)/);

        if (trackMatch) {
          trackIndex = trackMatch[1] as string;
        }
      }

      return ["id", `live_set tracks ${trackIndex} arrangement_clips 0`];
    }

    if (method === "get_notes_extended") {
      return JSON.stringify({ notes: [] });
    }

    if (method === "duplicate_clip_to_arrangement") {
      return ["id", DEFAULT_ARRANGEMENT_CLIP];
    }

    return null;
  });
}
