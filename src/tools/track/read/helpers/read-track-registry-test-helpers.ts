// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { mockTrackProperties } from "./read-track-test-helpers.ts";

interface SetupTrackMockOptions {
  trackPath?: string;
  trackId?: string;
  properties?: Record<string, unknown>;
}

interface SetupTrackMixerMocksOptions {
  trackPath?: string;
  trackId?: string;
  trackProperties?: Record<string, unknown>;
  mixerId?: string;
  mixerExists?: boolean;
  mixerProperties?: Record<string, unknown>;
  volumeId?: string;
  volumeExists?: boolean;
  volumeProperties?: Record<string, unknown>;
  panningId?: string;
  panningExists?: boolean;
  panningProperties?: Record<string, unknown>;
  panningMode?: number;
  leftSplitId?: string;
  leftSplitExists?: boolean;
  leftSplitProperties?: Record<string, unknown>;
  rightSplitId?: string;
  rightSplitExists?: boolean;
  rightSplitProperties?: Record<string, unknown>;
  sendIds?: string[];
  sendValues?: number[];
}

interface ResolvedTrackMixerMocksOptions {
  trackPath: string;
  trackId: string;
  trackProperties: Record<string, unknown>;
  mixerId: string;
  mixerExists: boolean;
  mixerProperties: Record<string, unknown>;
  volumeId: string;
  volumeExists: boolean;
  volumeProperties: Record<string, unknown>;
  panningId: string;
  panningExists: boolean;
  panningProperties: Record<string, unknown>;
  panningMode: number;
  leftSplitId: string;
  leftSplitExists: boolean;
  leftSplitProperties: Record<string, unknown>;
  rightSplitId: string;
  rightSplitExists: boolean;
  rightSplitProperties: Record<string, unknown>;
  sendIds: string[];
  sendValues: number[];
}

interface TrackMixerMockHandles {
  track: RegisteredMockObject;
  mixer?: RegisteredMockObject;
  volume?: RegisteredMockObject;
  panning?: RegisteredMockObject;
  leftSplit?: RegisteredMockObject;
  rightSplit?: RegisteredMockObject;
  sends: RegisteredMockObject[];
}

const DEFAULT_TRACK_PATH = "live_set tracks 0";

const DEFAULT_TRACK_MIXER_OPTIONS: ResolvedTrackMixerMocksOptions = {
  trackPath: DEFAULT_TRACK_PATH,
  trackId: "track1",
  trackProperties: {},
  mixerId: "mixer_1",
  mixerExists: true,
  mixerProperties: {},
  volumeId: "volume_param_1",
  volumeExists: true,
  volumeProperties: {},
  panningId: "panning_param_1",
  panningExists: true,
  panningProperties: {},
  panningMode: 0,
  leftSplitId: "left_split_param_1",
  leftSplitExists: true,
  leftSplitProperties: {},
  rightSplitId: "right_split_param_1",
  rightSplitExists: true,
  rightSplitProperties: {},
  sendIds: [],
  sendValues: [],
};

/**
 * Register a track mock object using the new registry-based mock system.
 * @param options - Track setup options
 * @param options.trackPath - Track path to register
 * @param options.trackId - Track ID to register
 * @param options.properties - Track property overrides
 * @returns Registered track handle
 */
export function setupTrackMock(
  options: SetupTrackMockOptions = {},
): RegisteredMockObject {
  const {
    trackPath = DEFAULT_TRACK_PATH,
    trackId = "track1",
    properties = {},
  } = options;

  return registerMockObject(trackId, {
    path: trackPath,
    type: "Track",
    properties: mockTrackProperties(properties),
  });
}

/**
 * Register a track with mixer-related children and parameter paths.
 * @param options - Mixer setup options
 * @param options.trackPath - Track path to register
 * @param options.trackId - Track ID to register
 * @param options.trackProperties - Track property overrides
 * @param options.mixerId - Mixer device ID
 * @param options.mixerExists - Whether the mixer device exists
 * @param options.mixerProperties - Mixer property overrides
 * @param options.volumeId - Volume parameter ID
 * @param options.volumeExists - Whether volume parameter exists
 * @param options.volumeProperties - Volume property overrides
 * @param options.panningId - Panning parameter ID
 * @param options.panningExists - Whether panning parameter exists
 * @param options.panningProperties - Panning property overrides
 * @param options.panningMode - Mixer panning mode
 * @param options.leftSplitId - Left split parameter ID
 * @param options.leftSplitExists - Whether left split parameter exists
 * @param options.leftSplitProperties - Left split property overrides
 * @param options.rightSplitId - Right split parameter ID
 * @param options.rightSplitExists - Whether right split parameter exists
 * @param options.rightSplitProperties - Right split property overrides
 * @param options.sendIds - Send parameter IDs
 * @param options.sendValues - Send parameter values in dB
 * @returns Registered handles for the created objects
 */
export function setupTrackMixerMocks(
  options: SetupTrackMixerMocksOptions = {},
): TrackMixerMockHandles {
  const resolved = {
    ...DEFAULT_TRACK_MIXER_OPTIONS,
    ...options,
  };
  const trackPath = resolved.trackPath;
  const mixerPath = `${trackPath} mixer_device`;
  const volumePath = `${mixerPath} volume`;
  const panningPath = `${mixerPath} panning`;
  const leftSplitPath = `${mixerPath} left_split_stereo`;
  const rightSplitPath = `${mixerPath} right_split_stereo`;

  const track = setupTrackMock({
    trackPath,
    trackId: resolved.trackId,
    properties: {
      ...resolved.trackProperties,
      mixer_device: children(resolved.mixerId),
    },
  });

  const sends: RegisteredMockObject[] = [];

  if (!resolved.mixerExists) {
    registerMockObject("0", { path: mixerPath, type: "MixerDevice" });

    return { track, sends };
  }

  const mixer = registerMockObject(resolved.mixerId, {
    path: mixerPath,
    type: "MixerDevice",
    properties: {
      panning_mode: resolved.panningMode,
      sends: toChildrenArray(resolved.sendIds),
      ...resolved.mixerProperties,
    },
  });

  const volume = setupDeviceParameter({
    exists: resolved.volumeExists,
    id: resolved.volumeId,
    path: volumePath,
    defaultProperties: { display_value: 0 },
    properties: resolved.volumeProperties,
  });

  const panning = setupDeviceParameter({
    exists: resolved.panningExists,
    id: resolved.panningId,
    path: panningPath,
    defaultProperties: { value: 0 },
    properties: resolved.panningProperties,
  });

  const { leftSplit, rightSplit } = setupSplitParameters({
    panningMode: resolved.panningMode,
    leftSplitExists: resolved.leftSplitExists,
    leftSplitId: resolved.leftSplitId,
    leftSplitPath,
    leftSplitProperties: resolved.leftSplitProperties,
    rightSplitExists: resolved.rightSplitExists,
    rightSplitId: resolved.rightSplitId,
    rightSplitPath,
    rightSplitProperties: resolved.rightSplitProperties,
  });

  sends.push(
    ...setupSendParameters(mixerPath, resolved.sendIds, resolved.sendValues),
  );

  return {
    track,
    mixer,
    volume,
    panning,
    leftSplit,
    rightSplit,
    sends,
  };
}

/**
 * Register Live Set return tracks so mixer send names can be resolved.
 * @param names - Return track names ordered by index
 */
export function setupReturnTrackNames(names: string[]): void {
  const returnTrackIds = names.map((_, index) => `return${index + 1}`);

  registerMockObject("liveSet", {
    path: "live_set",
    type: "Song",
    properties: {
      return_tracks:
        returnTrackIds.length > 0 ? children(...returnTrackIds) : [],
    },
  });

  for (const [index, name] of names.entries()) {
    registerMockObject(returnTrackIds[index] ?? `return${index + 1}`, {
      path: livePath.returnTrack(index),
      type: "Track",
      properties: {
        ...mockTrackProperties({
          has_midi_input: 0,
          name,
          mixer_device: [],
        }),
      },
    });
  }
}

interface DeviceParameterRegistrationOptions {
  exists: boolean;
  id: string;
  path: string;
  defaultProperties: Record<string, unknown>;
  properties: Record<string, unknown>;
}

interface SplitParameterRegistrationOptions {
  panningMode: number;
  leftSplitExists: boolean;
  leftSplitId: string;
  leftSplitPath: string;
  leftSplitProperties: Record<string, unknown>;
  rightSplitExists: boolean;
  rightSplitId: string;
  rightSplitPath: string;
  rightSplitProperties: Record<string, unknown>;
}

interface SplitParameters {
  leftSplit?: RegisteredMockObject;
  rightSplit?: RegisteredMockObject;
}

function setupDeviceParameter({
  exists,
  id,
  path,
  defaultProperties,
  properties,
}: DeviceParameterRegistrationOptions): RegisteredMockObject | undefined {
  if (!exists) {
    registerMockObject("0", {
      path,
      type: "DeviceParameter",
    });

    return undefined;
  }

  return registerMockObject(id, {
    path,
    type: "DeviceParameter",
    properties: {
      ...defaultProperties,
      ...properties,
    },
  });
}

function setupSplitParameters({
  panningMode,
  leftSplitExists,
  leftSplitId,
  leftSplitPath,
  leftSplitProperties,
  rightSplitExists,
  rightSplitId,
  rightSplitPath,
  rightSplitProperties,
}: SplitParameterRegistrationOptions): SplitParameters {
  if (panningMode !== 1) {
    return {};
  }

  const leftSplit = setupDeviceParameter({
    exists: leftSplitExists,
    id: leftSplitId,
    path: leftSplitPath,
    defaultProperties: { value: -1 },
    properties: leftSplitProperties,
  });
  const rightSplit = setupDeviceParameter({
    exists: rightSplitExists,
    id: rightSplitId,
    path: rightSplitPath,
    defaultProperties: { value: 1 },
    properties: rightSplitProperties,
  });

  return { leftSplit, rightSplit };
}

function setupSendParameters(
  mixerPath: string,
  sendIds: string[],
  sendValues: number[],
): RegisteredMockObject[] {
  return sendIds.map((sendId, index) =>
    registerMockObject(sendId, {
      path: `${mixerPath} sends ${index}`,
      type: "DeviceParameter",
      properties: {
        display_value: sendValues[index] ?? 0,
      },
    }),
  );
}

function toChildrenArray(ids: string[]): unknown[] {
  return ids.length > 0 ? children(...ids) : [];
}
