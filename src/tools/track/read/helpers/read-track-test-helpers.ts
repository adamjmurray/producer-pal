/**
 * Test helper functions for read-track tests
 */
import {
  children,
  liveApiId,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";

// Constants to avoid duplicate string errors
const HAS_MIDI_INPUT = "has_midi_input";
const TEST_TRACK_NAME = "Test Track";

interface PathIdMap {
  [path: string]: string;
}

interface MockTrackOverrides {
  name?: string;
  has_midi_input?: number;
  color?: number;
  mute?: number;
  solo?: number;
  arm?: number;
  can_be_armed?: number;
  is_foldable?: number;
  is_grouped?: number;
  group_track?: [string, number];
  playing_slot_index?: number;
  fired_slot_index?: number;
  muted_via_solo?: number;
  clip_slots?: unknown[];
  arrangement_clips?: unknown[];
  devices?: unknown[];
  back_to_arranger?: number;
  mixer_device?: unknown;
  [key: string]: unknown;
}

interface MixerPathIdMapOptions {
  trackPath?: string;
  trackId?: string;
  mixerId?: string;
  volumeId?: string;
  panningId?: string;
  leftSplitId?: string;
  rightSplitId?: string;
}

interface SplitPanningMockOptions {
  gainDb?: number;
  leftPan?: number;
  rightPan?: number;
}

interface SplitPanningMockData {
  Track: {
    has_midi_input: number;
    name: string;
    clip_slots: unknown[];
    devices: unknown[];
    mixer_device: unknown;
  };
  mixer_1: {
    volume: unknown;
    panning_mode: number;
    left_split_stereo: unknown;
    right_split_stereo: unknown;
  };
  volume_param_1: {
    display_value: number;
  };
  left_split_param_1: {
    value: number;
  };
  right_split_param_1: {
    value: number;
  };
}

interface RoutingMockOverrides {
  available_input_routing_channels?: string[];
  available_input_routing_types?: string[];
  available_output_routing_channels?: string[];
  available_output_routing_types?: string[];
  input_routing_channel?: string[];
  input_routing_type?: string[];
  output_routing_channel?: string[];
  output_routing_type?: string[];
  [key: string]: unknown;
}

interface MixerWithSendsMockOptions {
  sendIds?: string[];
  sendValues?: number[];
  gainDb?: number;
  pan?: number;
}

interface DrumChainMockOptions {
  inNote: number;
  name: string;
  deviceId?: string;
  color?: number;
  mute?: boolean;
  solo?: boolean;
  mutedViaSolo?: boolean;
}

interface SimpleInstrumentMockOptions {
  name?: string;
  className?: string;
}

/**
 * Setup liveApiId mock for device tests with a path-to-ID mapping.
 * Falls back to this._id for unmatched paths.
 * @param pathIdMap - Mapping of paths to IDs
 */
export function setupDevicePathIdMock(pathIdMap: PathIdMap): void {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext): string {
    if (this._path && pathIdMap[this._path]) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test setup guarantees value exists after map lookup
      return pathIdMap[this._path]!;
    }

    return this._id ?? "";
  });
}

/**
 * Creates a mock track object with default properties
 * @param overrides - Properties to override the defaults
 * @returns Mock track properties
 */
export const mockTrackProperties = (
  overrides: MockTrackOverrides = {},
): MockTrackOverrides => ({
  name: TEST_TRACK_NAME,
  [HAS_MIDI_INPUT]: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  can_be_armed: 1,
  is_foldable: 0,
  is_grouped: 0,
  group_track: ["id", 0],
  playing_slot_index: -1,
  fired_slot_index: -1,
  muted_via_solo: 0,
  clip_slots: [],
  arrangement_clips: [],
  devices: [],
  back_to_arranger: 0,
  mixer_device: children("mixer_1"),
  ...overrides,
});

/**
 * Setup liveApiId mock with a path-to-ID mapping
 * @param pathIdMap - Mapping of paths to IDs
 * @param defaultId - Default ID for unmatched paths
 */
export function setupMixerIdMock(
  pathIdMap: PathIdMap,
  defaultId = "id 0",
): void {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext): string {
    // Handle ID-based paths (from getChildren)
    if (this.path?.startsWith("id ")) {
      return this.path.slice(3);
    }

    return pathIdMap[this.path ?? ""] ?? defaultId;
  });
}

/**
 * Create standard mixer path-to-ID mapping for a track
 * @param opts - Options for the mapping
 * @returns Path-to-ID mapping
 */
export function createMixerPathIdMap(
  opts: MixerPathIdMapOptions = {},
): PathIdMap {
  const {
    trackPath = "live_set tracks 0",
    trackId = "track1",
    mixerId = "mixer_1",
    volumeId = "volume_param_1",
    panningId = "panning_param_1",
    leftSplitId,
    rightSplitId,
  } = opts;

  const map: PathIdMap = {
    [trackPath]: trackId,
    [`${trackPath} mixer_device`]: mixerId,
    [`${trackPath} mixer_device volume`]: volumeId,
    [`${trackPath} mixer_device panning`]: panningId,
  };

  if (leftSplitId) {
    map[`${trackPath} mixer_device left_split_stereo`] = leftSplitId;
  }

  if (rightSplitId) {
    map[`${trackPath} mixer_device right_split_stereo`] = rightSplitId;
  }

  return map;
}

/**
 * Create mock data for split panning mode test
 * @param opts - Options for the mock
 * @returns Mock data object for mockLiveApiGet
 */
export function createSplitPanningMock(
  opts: SplitPanningMockOptions = {},
): SplitPanningMockData {
  const { gainDb = 0, leftPan = -1, rightPan = 1 } = opts;

  return {
    Track: {
      [HAS_MIDI_INPUT]: 1,
      name: TEST_TRACK_NAME,
      clip_slots: [],
      devices: [],
      mixer_device: children("mixer_1"),
    },
    mixer_1: {
      volume: children("volume_param_1"),
      panning_mode: 1, // Split mode
      left_split_stereo: children("left_split_param_1"),
      right_split_stereo: children("right_split_param_1"),
    },
    volume_param_1: {
      display_value: gainDb,
    },
    left_split_param_1: {
      value: leftPan,
    },
    right_split_param_1: {
      value: rightPan,
    },
  };
}

/**
 * Creates standard routing mock properties for track routing tests.
 * @param overrides - Properties to override the defaults
 * @returns Routing properties for mockTrackProperties
 */
export function createRoutingMockProperties(
  overrides: RoutingMockOverrides = {},
): RoutingMockOverrides {
  return {
    available_input_routing_channels: [
      '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
    ],
    available_input_routing_types: [
      '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
    ],
    available_output_routing_channels: [
      '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
    ],
    available_output_routing_types: [
      '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
    ],
    input_routing_channel: [
      '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
    ],
    input_routing_type: [
      '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
    ],
    output_routing_channel: [
      '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
    ],
    output_routing_type: [
      '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
    ],
    ...overrides,
  };
}

/**
 * Creates mock data for mixer with sends test
 * @param opts - Options for the mock
 * @returns Mock data object for mockLiveApiGet
 */
export function createMixerWithSendsMock(
  opts: MixerWithSendsMockOptions = {},
): Record<string, unknown> {
  const { sendIds = [], sendValues = [], gainDb = 0, pan = 0 } = opts;

  const result: Record<string, unknown> = {
    Track: {
      [HAS_MIDI_INPUT]: 1,
      name: TEST_TRACK_NAME,
      clip_slots: [],
      devices: [],
      mixer_device: children("mixer_1"),
    },
    mixer_1: {
      volume: children("volume_param_1"),
      panning: children("panning_param_1"),
      sends: sendIds.length > 0 ? children(...sendIds) : [],
      panning_mode: 0,
    },
    volume_param_1: {
      display_value: gainDb,
    },
    panning_param_1: {
      value: pan,
    },
  };

  // Add send parameter values
  for (const [index, sendId] of sendIds.entries()) {
    result[sendId] = {
      display_value: sendValues[index] ?? 0,
    };
  }

  return result;
}

/**
 * Creates mock data for drum rack chain with optional instrument
 * @param opts - Options for the drum chain
 * @returns Chain mock data
 */
export function createDrumChainMock(opts: DrumChainMockOptions): {
  in_note: number;
  name: string;
  color: number;
  mute: number;
  muted_via_solo: number;
  solo: number;
  devices: unknown[];
} {
  const {
    inNote,
    name,
    deviceId,
    color = 0,
    mute = false,
    solo = false,
    mutedViaSolo = false,
  } = opts;

  return {
    in_note: inNote,
    name,
    color,
    mute: mute ? 1 : 0,
    muted_via_solo: mutedViaSolo ? 1 : 0,
    solo: solo ? 1 : 0,
    devices: deviceId ? children(deviceId) : [],
  };
}

/**
 * Creates mock data for a simple instrument device
 * @param opts - Options for the device
 * @returns Device mock data
 */
export function createSimpleInstrumentMock(
  opts: SimpleInstrumentMockOptions = {},
): {
  name: string;
  class_name: string;
  class_display_name: string;
  type: number;
  is_active: number;
  can_have_chains: number;
  can_have_drum_pads: number;
} {
  const { name = "Simpler", className = "Simpler" } = opts;

  return {
    name,
    class_name: className,
    class_display_name: className,
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    is_active: 1,
    can_have_chains: 0,
    can_have_drum_pads: 0,
  };
}

interface SetupDrumRackMockOptions {
  kickDeviceId?: string;
}

/**
 * Setup complete drum rack mocks with track, chain, and kick instrument.
 * Configures both liveApiId and mockLiveApiGet for drum rack testing.
 * @param options - Configuration options
 * @param options.kickDeviceId - ID for the kick device (default: "kick_device")
 */
export function setupDrumRackMocks(
  options: SetupDrumRackMockOptions = {},
): void {
  const { kickDeviceId = "kick_device" } = options;

  liveApiId.mockImplementation(function (this: MockLiveAPIContext): string {
    switch (this._path) {
      case "live_set tracks 0":
        return "track1";
      case "live_set tracks 0 devices 0":
        return "drumrack1";
      case "live_set tracks 0 devices 0 chains 0":
        return "chain1";
      case "live_set tracks 0 devices 0 chains 0 devices 0":
        return kickDeviceId;
      default:
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test setup guarantees _id is set
        return this._id!;
    }
  });

  mockLiveApiGet({
    Track: mockTrackProperties({
      devices: children("drumrack1"),
    }),
    drumrack1: {
      name: "Test Drum Rack",
      class_name: "DrumGroupDevice",
      class_display_name: "Drum Rack",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      is_active: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      chains: children("chain1"),
      return_chains: [],
    },
    chain1: {
      in_note: 60, // C3
      name: "Test Kick",
      mute: 0,
      muted_via_solo: 0,
      solo: 0,
      devices: children(kickDeviceId),
    },
    [kickDeviceId]: {
      name: "Kick Instrument",
      class_name: "Simpler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    },
  });
}
