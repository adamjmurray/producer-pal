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
