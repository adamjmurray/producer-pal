// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What V8 and Node share about clip automation envelopes, which only the
// Producer Pal remote script (remote-script/) can reach. Result shapes are the
// remote script's own JSON, so their fields stay snake_case.

import { type CurveCoefficients } from "#src/notation/barbeat/envelope/envelope-curves.ts";
import { type RouteReply } from "#src/tools/shared/remote-script/remote-script-route-contract.ts";

// Envelope calls wait as long as a device load does.
export {
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";

/** The Node routes V8 calls to reach the remote script's envelope routes. */
export const ENVELOPE_ROUTES = {
  list: "remoteScript.envelope.list",
  read: "remoteScript.envelope.read",
  write: "remoteScript.envelope.write",
  clear: "remoteScript.envelope.clear",
} as const;

/** Which clip, and which of its parameters, every envelope route takes. */
export interface EnvelopeRequest {
  /** t0, rt0 or mt */
  track: string;
  /** 0-based Session slot; give this or arrangementIndex */
  slot?: number;
  arrangementIndex?: number;
  /** d0, or d0/c1/d0 into rack chains; absent means the mixer */
  device?: string;
  /** A device parameter's exact name or 0-based index, or volume/pan/send0.. */
  parameter?: string | number;
}

export type EnvelopeListRequest = EnvelopeRequest;

/** Clearing with no device or parameter clears every envelope on the clip. */
export type EnvelopeClearRequest = EnvelopeRequest;

export interface EnvelopeReadRequest extends EnvelopeRequest {
  /** Beats from the clip start */
  from?: number;
  to?: number;
  limit?: number;
}

export interface EnvelopeWriteRequest extends EnvelopeRequest {
  /** Replaces the whole envelope; values are raw min..max */
  points: EnvelopeWritePoint[];
}

/** A point to write: ramps from the previous one unless `jump` holds then jumps. */
export interface EnvelopeWritePoint extends EnvelopePoint {
  jump?: boolean;
  /** The curve of the segment this point starts; absent means straight */
  coefficients?: CurveCoefficients;
}

/** A time in beats from the clip start, and a raw min..max value. */
export interface EnvelopePoint {
  time: number;
  value: number;
}

/** What the remote script says about a parameter. */
export interface ParameterInfo {
  name: string;
  min: number;
  max: number;
  value: number;
  /** What Live shows for `value` */
  display: string;
  quantized: boolean;
  enabled: boolean;
  automation_state: number;
}

/** What an envelope route answers. `error` is worded for the model. */
export type EnvelopeReply<Result> = RouteReply<Result>;

export interface EnvelopeListResult {
  envelopes: {
    /** Set for a mixer parameter: volume, pan or send0.. */
    parameter_name?: string;
    /** Set for a device parameter, with parameter_index */
    device?: string;
    parameter_index?: number;
    parameter: ParameterInfo;
    event_count: number;
  }[];
}

export interface EnvelopeReadResult {
  exists: boolean;
  parameter: ParameterInfo;
  from?: number;
  to?: number;
  /** Events in range, before `limit` cut them down */
  event_count?: number;
  events?: EnvelopeEvent[];
  truncated?: boolean;
}

/**
 * One envelope event: raw `value`, and the event's own value in `display`,
 * which is Live's units (linear gain for dB, Hz, seconds), not raw.
 */
export interface EnvelopeEvent {
  time: number;
  value: number;
  display: number;
  display_str: string;
  /** The curve of the segment this event starts; absent when straight */
  coefficients?: CurveCoefficients;
}

export interface EnvelopeWriteResult {
  parameter: ParameterInfo;
  /** The envelope read back just after each point's time */
  samples: EnvelopePoint[];
  /** Present when the parameter's automation was overridden and the write re-enabled it */
  re_enabled?: true;
}

export interface EnvelopeClearResult {
  /** Whether an envelope Producer Pal can see was removed */
  cleared: boolean;
  /** True when the call asked to clear the whole clip */
  all?: boolean;
  /**
   * With `all`: whether the clip still holds envelopes afterwards (modulation,
   * clip-level or MIDI CC), which clearing can't remove
   */
  remaining?: boolean;
}

export type EnvelopeListReply = EnvelopeReply<EnvelopeListResult>;
export type EnvelopeReadReply = EnvelopeReply<EnvelopeReadResult>;
export type EnvelopeWriteReply = EnvelopeReply<EnvelopeWriteResult>;
export type EnvelopeClearReply = EnvelopeReply<EnvelopeClearResult>;
