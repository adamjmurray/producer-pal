// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What V8 and Node share about loading a device from Live's browser through the
// Producer Pal remote script (remote-script/): route names, answers, timeouts.

/** The Node routes V8 calls to reach the remote script. */
export const REMOTE_SCRIPT_ROUTES = {
  resolve: "remoteScript.resolve",
  load: "remoteScript.load",
} as const;

// Node's waits outlast the remote script's 30s. V8's does too unless the
// request's deadline is nearer, so V8 may stop waiting and delete its temp track
// while a load is queued in Live. A load finds that track by name, so a late one
// is refused, not put on another track.

/** Node's wait for one HTTP reply. Longer than the remote script's own 30s. */
export const REMOTE_SCRIPT_HTTP_TIMEOUT_MS = 35_000;

/** How long Node lets a remote-script route run. */
export const REMOTE_SCRIPT_ROUTE_TIMEOUT_MS = 40_000;

/**
 * How long V8 waits for a remote-script route. Cut short to fit the request's
 * deadline: V8 must answer before Node's tool timeout does, even if a load is
 * still queued.
 */
export const REMOTE_SCRIPT_REQUEST_TIMEOUT_MS = 45_000;

/** Something in Live's browser the remote script can load. */
export interface BrowserItem {
  /** The remote script's `type`: plugin, mfl-device, instrument, audio-effect, or midi-effect */
  type: string;
  /** Where it sits under that type's browser section */
  path: string;
  name: string;
}

/** What remoteScript.resolve answers. `error` is worded for the model. */
export type BrowserItemResolution =
  | { available: false }
  | { available: true; item: BrowserItem }
  | { available: true; error: string };

/** What remoteScript.load answers. `error` is worded for the model. */
export type BrowserItemLoad =
  | { available: false }
  | { available: true; error?: string };
