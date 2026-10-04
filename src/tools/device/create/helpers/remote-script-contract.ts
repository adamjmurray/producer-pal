// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What V8 and Node share about the Producer Pal remote script (remote-script/):
// loading a device or preset from Live's browser, and copying a device. Route
// names, answers, timeouts.

/** The Node routes V8 calls to reach the remote script. */
export const REMOTE_SCRIPT_ROUTES = {
  resolve: "remoteScript.resolve",
  resolvePreset: "remoteScript.resolvePreset",
  load: "remoteScript.load",
  hotswap: "remoteScript.hotswap",
  duplicateDevice: "remoteScript.duplicateDevice",
} as const;

// One deadline covers the lookup and the load of a create-device call. V8 waits
// until the request's deadline, and hands each step an expiry a bit under its
// wait. Node derives every HTTP wait from that expiry, so the steps don't stack
// their own limits, and the remote script skips a job it hasn't started by then
// rather than make a change V8 already reported as failed. The fixed waits
// below are for calls that carry no expiry.

/** Node's wait for one HTTP reply that carries no expiry. */
export const REMOTE_SCRIPT_HTTP_TIMEOUT_MS = 35_000;

/**
 * How long V8 waits for a remote-script route. Cut short to fit the request's
 * deadline: V8 must answer before Node's tool timeout does, even if a load is
 * still queued.
 */
export const REMOTE_SCRIPT_REQUEST_TIMEOUT_MS = 45_000;

/**
 * How long Node lets a remote-script route run. A backstop: the route's own
 * waits end sooner.
 */
export const REMOTE_SCRIPT_ROUTE_TIMEOUT_MS = REMOTE_SCRIPT_REQUEST_TIMEOUT_MS;

/**
 * How much sooner than V8's wait a change expires. Covers the trip to the
 * remote script and back, where Max and Node can each stall under load, plus a
 * typical load. A job that starts in time but runs past V8's wait still lands
 * after V8 reported it failed.
 */
export const REMOTE_SCRIPT_EXPIRY_MARGIN_MS = 2000;

/**
 * The most Node waits past a request's expiry for the reply to a job Live
 * started in time. Never more than half the expiry, so Node answers before V8
 * stops waiting.
 */
export const REMOTE_SCRIPT_REPLY_GRACE_MS = 1000;

/** Something in Live's browser the remote script can load. */
export interface BrowserItem {
  /**
   * The remote script's `type`: plugin, mfl-device, instrument, audio-effect,
   * midi-effect, or file
   */
  type: string;
  /** Where it sits under that type's browser section; for a file, its absolute path */
  path: string;
  name: string;
}

/** Where a device's presets sit in Live's browser. */
export interface PresetScope {
  /** The device's remote script `type` */
  type: string;
  /** The device's path under that type's section */
  path: string;
  /** The device as the call named it, for errors */
  device: string;
  /**
   * Search every preset when the device has none by that name, instead of
   * failing. For a device already in the Set, whose preset may be a rack.
   */
  orAnywhere?: boolean;
}

/**
 * What remoteScript.resolve answers. `error` is worded for the model;
 * `outOfTime` marks a search that ran out of its time, not one that found a
 * problem.
 */
export type BrowserItemResolution =
  | { available: false }
  | { available: true; item: BrowserItem }
  | { available: true; error: string; outOfTime?: true };

/**
 * What remoteScript.load answers. `error` is worded for the model; `unfinished`
 * marks a load that timed out after Live may have started it.
 */
export type BrowserItemLoad =
  | { available: false }
  | { available: true; error?: string; unfinished?: true };

/**
 * What remoteScript.hotswap answers: whether Live put a new device in place of
 * the old one. `error` is worded for the model; `unfinished` marks a load that
 * timed out after Live may have started it.
 */
export type BrowserItemHotswap =
  | { available: false }
  | { available: true; replaced: boolean }
  | { available: true; error: string; unfinished?: true };

/**
 * What remoteScript.duplicateDevice answers: where Live put the copy (right
 * after the original, so `index` is the original's plus one). `available: false`
 * also covers a remote script too old to have the route. `error` is worded for
 * the model; `unfinished` marks a copy that timed out after Live may have made
 * it.
 */
export type DeviceDuplication =
  | { available: false }
  | { available: true; index: number }
  | { available: true; error: string; unfinished?: true };
