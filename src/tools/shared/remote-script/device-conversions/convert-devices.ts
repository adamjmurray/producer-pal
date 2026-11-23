// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A track's devices onto a pad of a new Drum Rack, and a drum pad's chain onto
// a new MIDI track. Max's Live API has neither; the Producer Pal remote script
// reaches them through Live's Python API.

import {
  type RouteOutcome,
  settledRemoteScriptChange,
} from "#src/tools/shared/remote-script/remote-script-route.ts";
import {
  DEVICE_CONVERSION_ROUTES,
  type DrumPadToTrackRequest,
  type DrumPadToTrackResult,
  type TrackToDrumRackRequest,
  type TrackToDrumRackResult,
} from "./device-conversions-contract.ts";

const REMOTE_SCRIPT_MISSING = "the Producer Pal remote script isn't running";

/**
 * Put a track's devices on pad C1 of a new Drum Rack, on a new track right
 * after it. Never throws. Live keeps a source track that has clips and deletes
 * one that has none.
 * @param trackIndex - The source's place among the regular tracks
 * @param deadline - The request deadline from ToolContext, if any
 * @param manage - Whether the caller can use ppal-manage
 * @returns Where the new track is and whether the source is gone, or why not
 */
export function convertTrackToDrumRack(
  trackIndex: number,
  deadline: number | null | undefined,
  manage: boolean,
): Promise<RouteOutcome<TrackToDrumRackResult>> {
  const request: TrackToDrumRackRequest = { track: `t${trackIndex}` };

  return settledRemoteScriptChange<TrackToDrumRackResult>(
    DEVICE_CONVERSION_ROUTES.trackToDrumRack,
    request,
    deadline,
    REMOTE_SCRIPT_MISSING,
    manage,
  );
}

/**
 * Copy a drum pad's chain onto a new MIDI track, right after the rack's track.
 * Never throws. The pad keeps its chain.
 * @param request - The Drum Rack's Live path and the pad's note
 * @param deadline - The request deadline from ToolContext, if any
 * @param manage - Whether the caller can use ppal-manage
 * @returns Where the new track is, or why there isn't one
 */
export function convertDrumPadToTrack(
  request: DrumPadToTrackRequest,
  deadline: number | null | undefined,
  manage: boolean,
): Promise<RouteOutcome<DrumPadToTrackResult>> {
  return settledRemoteScriptChange<DrumPadToTrackResult>(
    DEVICE_CONVERSION_ROUTES.drumPadToTrack,
    request,
    deadline,
    REMOTE_SCRIPT_MISSING,
    manage,
  );
}
