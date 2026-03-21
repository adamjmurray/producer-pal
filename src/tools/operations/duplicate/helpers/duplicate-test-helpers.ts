// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

export { children };
export { type RegisteredMockObject, registerMockObject };

/**
 * Register a clip slot and optionally its clip in the mock registry.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 * @param hasClip - Whether the clip slot has a clip
 * @param clipProperties - Optional clip properties (registered only if hasClip)
 * @returns The clip handle if hasClip and clipProperties, otherwise the slot handle
 */
export function registerClipSlot(
  trackIndex: number,
  sceneIndex: number,
  hasClip: boolean,
  clipProperties?: Record<string, unknown>,
): RegisteredMockObject {
  const slot = registerMockObject(
    `live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}`,
    {
      path: livePath.track(trackIndex).clipSlot(sceneIndex),
      properties: { has_clip: hasClip ? 1 : 0 },
    },
  );

  if (hasClip && clipProperties) {
    return registerMockObject(
      `live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}/clip`,
      {
        path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
        properties: clipProperties,
      },
    );
  }

  return slot;
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
 * Setup mock property data for routeToSource track tests.
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
    [livePath.track(0).toString()]: sourceTrackMock as unknown as Record<
      string,
      unknown
    >,
    [livePath.track(1).toString()]: {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: trackName, identifier: "source_track_id" },
      ],
    },
  };
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
 * Register an arrangement clip mock with standard properties.
 * @param trackIndex - Track index
 * @param clipIndex - Arrangement clip index
 * @param startTime - Clip start time in beats
 * @returns Registered mock object
 */
export function registerArrangementClip(
  trackIndex: number,
  clipIndex: number,
  startTime: number,
): RegisteredMockObject {
  return registerMockObject(
    livePath.track(trackIndex).arrangementClip(clipIndex),
    {
      path: livePath.track(trackIndex).arrangementClip(clipIndex),
      properties: { is_arrangement_clip: 1, start_time: startTime },
    },
  );
}

/**
 * Register a track mock with a `duplicate_clip_to_arrangement` method that
 * returns arrangement clip IDs from a counter.
 * @param trackIndex - Track index
 * @param properties - Optional additional track properties
 * @returns Object with the registered track mock and a counter reset function
 */
export function registerTrackWithArrangementDup(
  trackIndex: number,
  properties?: Record<string, unknown>,
): RegisteredMockObject {
  let clipCounter = 0;

  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties,
    methods: {
      duplicate_clip_to_arrangement: () => {
        const clipId = livePath.track(trackIndex).arrangementClip(clipCounter);

        clipCounter++;

        return ["id", clipId];
      },
    },
  });
}

/**
 * Verify that delete_device was called for each device in reverse order.
 * @param track - Mock object handle for the track
 * @param deviceCount - Number of devices that should have been deleted
 */
export function expectDeleteDeviceCalls(
  track: RegisteredMockObject,
  deviceCount: number,
): void {
  for (let i = deviceCount - 1; i >= 0; i--) {
    expect(track.call).toHaveBeenCalledWith("delete_device", i);
  }
}

/**
 * Register clip mock objects for each track at a given scene index.
 * @param trackCount - Number of tracks
 * @param sceneIndex - Scene index for the clip slot
 */
export function registerClipMocks(
  trackCount: number,
  sceneIndex: number,
): void {
  for (let i = 0; i < trackCount; i++) {
    registerMockObject(`live_set/tracks/${i}/clip_slots/${sceneIndex}/clip`, {
      path: livePath.track(i).clipSlot(sceneIndex).clip(),
    });
  }
}

/**
 * Set up common scene duplication mocks: a source scene, a live_set with
 * tracks, clip slots at a target scene index, clip mock objects, and
 * optionally the newly created scene.
 * @param opts - Options
 * @param opts.trackCount - Number of tracks (default 2)
 * @param opts.targetSceneIndex - Target scene index for clip slots (default 1)
 * @param opts.registerNewScene - Whether to register the new scene mock (default true)
 * @returns The registered live_set mock object
 */
export function setupSessionSceneMocks(
  opts: {
    trackCount?: number;
    targetSceneIndex?: number;
    registerNewScene?: boolean;
  } = {},
): RegisteredMockObject {
  const {
    trackCount = 2,
    targetSceneIndex = 1,
    registerNewScene = true,
  } = opts;

  registerMockObject("scene1", { path: livePath.scene(0) });

  const trackIds = Array.from({ length: trackCount }, (_, i) => `track${i}`);
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...trackIds) },
  });

  for (let i = 0; i < trackCount; i++) {
    registerClipSlot(i, targetSceneIndex, true);
  }

  registerClipMocks(trackCount, targetSceneIndex);

  if (registerNewScene) {
    registerMockObject(`live_set/scenes/${targetSceneIndex}`, {
      path: livePath.scene(targetSceneIndex),
    });
  }

  return liveSet;
}

/**
 * Set up common arrangement scene duplication mocks: a source scene and a
 * live_set with the given number of tracks.
 * @param trackCount - Number of tracks (default 3)
 * @returns The registered live_set mock object
 */
export function setupArrangementSceneMocks(
  trackCount = 3,
): RegisteredMockObject {
  registerMockObject("scene1", { path: livePath.scene(0) });

  const trackIds = Array.from({ length: trackCount }, (_, i) => `track${i}`);

  return registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children(...trackIds) },
  });
}

/**
 * Register mocks for duplicating a session clip from one slot to another.
 * Sets up the source clip, source clip slot (has_clip=1), and dest clip slot (has_clip=0).
 * @param opts - Options
 * @param opts.sourceClipId - Source clip mock ID (default: "clip1")
 * @param opts.trackIndex - Track index (default: 0)
 * @param opts.sourceScene - Source scene index (default: 0)
 * @param opts.destScene - Destination scene index (default: 1)
 * @param opts.destClipProperties - Optional properties for the destination clip mock
 * @returns Object with source clip slot mock
 */
export function registerSessionClipDuplication(
  opts: {
    sourceClipId?: string;
    trackIndex?: number;
    sourceScene?: number;
    destScene?: number;
    destClipProperties?: Record<string, unknown>;
  } = {},
): { sourceClipSlot: RegisteredMockObject } {
  const {
    sourceClipId = "clip1",
    trackIndex = 0,
    sourceScene = 0,
    destScene = 1,
    destClipProperties,
  } = opts;

  registerMockObject(sourceClipId, {
    path: livePath.track(trackIndex).clipSlot(sourceScene).clip(),
  });

  const sourceClipSlot = registerClipSlot(trackIndex, sourceScene, true);

  registerClipSlot(trackIndex, destScene, false);

  if (destClipProperties) {
    registerMockObject(
      `live_set/tracks/${trackIndex}/clip_slots/${destScene}/clip`,
      {
        path: livePath.track(trackIndex).clipSlot(destScene).clip(),
        properties: destClipProperties,
      },
    );
  }

  return { sourceClipSlot };
}

/**
 * Set up common mocks for device duplication tests: a source device on
 * track 0, a live_set, and the expected temp device on track 1.
 * @param deviceIndex - Device index on the source track (default: 0)
 * @returns The registered live_set mock object
 */
export function setupDeviceDuplicationMocks(deviceIndex = 0): {
  liveSet: RegisteredMockObject;
} {
  registerMockObject("device1", {
    path: livePath.track(0).device(deviceIndex),
    type: "PluginDevice",
  });
  const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

  registerMockObject(`live_set/tracks/1/devices/${deviceIndex}`, {
    path: livePath.track(1).device(deviceIndex),
  });

  return { liveSet };
}

/**
 * Sets up mocks for Producer Pal device tests with 3 devices on track 1
 * @returns Handles for liveSet and newTrack mocks
 */
export function setupProducerPalDeviceMocks(): {
  liveSet: RegisteredMockObject;
  newTrack: RegisteredMockObject;
} {
  registerMockObject("track1", { path: livePath.track(0) });
  registerMockObject("this_device", {
    path: livePath.track(0).device(1),
  });
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
  });
  const newTrack = registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: {
      devices: children("device0", "device1", "device2"),
      clip_slots: [],
      arrangement_clips: [],
    },
  });

  return { liveSet, newTrack };
}

/**
 * Setup common mocks for routeToSource track tests
 * @param opts - Options for setupRouteToSourceMock
 * @returns Handles for sourceTrack and newTrack mocks
 */
export function setupRoutingMocks(
  opts: Parameters<typeof setupRouteToSourceMock>[0] = {},
): { sourceTrack: RegisteredMockObject; newTrack: RegisteredMockObject } {
  registerMockObject("track1", { path: livePath.track(0) });
  registerMockObject("live_set", { path: livePath.liveSet });

  const mockData = setupRouteToSourceMock(opts);

  const sourceTrack = registerMockObject("live_set/tracks/0", {
    path: livePath.track(0),
    properties: mockData[String(livePath.track(0))] as Record<string, unknown>,
  });
  const newTrack = registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: {
      ...(mockData[String(livePath.track(1))] as Record<string, unknown>),
      devices: [],
      clip_slots: [],
      arrangement_clips: [],
    },
  });

  return { sourceTrack, newTrack };
}
