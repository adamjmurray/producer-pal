// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The Node routes V8 calls to reach the remote script's `/track/to-drum-rack`
 * and `/device/drum-pad/to-track`.
 */
export const DEVICE_CONVERSION_ROUTES = {
  trackToDrumRack: "remoteScript.track.toDrumRack",
  drumPadToTrack: "remoteScript.device.drumPadToTrack",
} as const;

/** What `update-track`'s `convert` can make of a track. */
export const TRACK_CONVERT_TYPES = ["drum-rack"] as const;

export type TrackConvertType = (typeof TRACK_CONVERT_TYPES)[number];

/** The track whose devices go onto a new Drum Rack's pad: t0, t1... */
export interface TrackToDrumRackRequest {
  track: string;
}

/** What that conversion answers. */
export interface TrackToDrumRackResult {
  /** Where the new track is now */
  track_index: number;
  /** Live deletes a source track that has no clips */
  source_removed: boolean;
}

/** The pad to copy onto a new MIDI track: its Drum Rack's path, and its note. */
export interface DrumPadToTrackRequest {
  devicePath: string;
  note: number;
}

/** What that conversion answers: where the new track is. */
export interface DrumPadToTrackResult {
  track_index: number;
}
