// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about converting an audio clip into a new track, which
// only the Producer Pal remote script (remote-script/) can do.

import { type RemoteScriptUnavailable } from "#src/tools/shared/remote-script/outdated-remote-script.ts";

/** What a clip can be converted to. */
export const CONVERT_TYPES = [
  "drums",
  "melody",
  "harmony",
  "simpler",
  "drum-rack",
] as const;

export type ConvertType = (typeof CONVERT_TYPES)[number];

/** The kinds that make a MIDI clip on the new track. */
export const MIDI_CONVERT_TYPES: ReadonlySet<ConvertType> = new Set([
  "drums",
  "melody",
  "harmony",
]);

/** The Node route V8 calls to reach the remote script's `/clip/convert`. */
export const CONVERT_ROUTE = "remoteScript.clip.convert";

/** Which clip to convert, and how. */
export interface ConvertRequest {
  /** t0, t1... a regular track */
  track: string;
  /** 0-based Session slot; give this or arrangementIndex */
  slot?: number;
  arrangementIndex?: number;
  type: ConvertType;
  /** How long Live may leave the job queued before skipping it */
  expiresInMs: number;
}

/**
 * What the route answers. `error` is worded for the model; `unfinished` marks a
 * call that timed out after Live may have started it. The conversion's own work
 * happens after the route answers, so there's no result to carry.
 */
export type ConvertReply =
  | RemoteScriptUnavailable
  | { available: true; error?: string; unfinished?: true };
