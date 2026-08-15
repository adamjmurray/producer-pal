// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Releases the path listeners Live arms behind every LiveAPI object.
 *
 * Live installs a listener on each collection along a path-based object's path
 * (live_set.tracks, track.devices, ...) and never takes them down. Assigning an
 * empty path is the only thing that does. An unreleased object costs ~5 KB of
 * Ableton log on every later structural change to the Live Set.
 *
 * So objects are tracked as they are built and released when the request that
 * built them ends. Identity and lifetime *within* a request are untouched.
 *
 * This does not fix the other cost of a LiveAPI object. Construction also
 * registers a context in MxDCore, and clearing the path only retargets the
 * object — the registration stays, so every later construction is slower for
 * it. Measured on 12.4.3, 2,500 read-track calls took the next one from 27 ms
 * to 90 ms, and the slope is unchanged by this release. Only a device reload
 * clears it; pooling objects instead of building new ones is the open fix.
 *
 * Don't reach for freepeer(): it frees the JS peer and leaves the listener
 * armed. 500 read-track calls still armed 6,002 listeners and the next track
 * delete still wrote 30 MB of log — the state the SendMessage errors come from.
 */

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

const trackedObjects: LiveAPI[] = [];

/**
 * Open request scopes. Requests overlap whenever a tool awaits (code exec, node
 * requests, parallel tool calls), and releasing an object another request still
 * holds would silently turn it into a nonexistent one — a cleared path reports
 * id "0", so exists() goes false. Counting scopes instead of tagging objects
 * per request just defers the release until the last one finishes.
 */
let openScopes = 0;

/**
 * Track a LiveAPI object for release at the end of the current request.
 * @param api - The object to track
 * @returns The same object, for call-site chaining
 */
export function trackLiveApiObject(api: LiveAPI): LiveAPI {
  trackedObjects.push(api);

  return api;
}

/** Mark the start of a request that may build LiveAPI objects. */
export function beginLiveApiScope(): void {
  openScopes++;
}

/** Mark the end of a request, releasing every tracked object once none remain. */
export function endLiveApiScope(): void {
  // A stray end (an entry point that forgot its begin) closes nothing, so it
  // must not release either: with no scope open the objects it would free
  // belong to whatever request is actually running.
  if (openScopes === 0) return;

  openScopes--;

  if (openScopes === 0) {
    releaseTrackedObjects();
  }
}

/** Drop tracked objects without releasing them. For test setup only. */
export function resetLiveApiTracking(): void {
  trackedObjects.length = 0;
  openScopes = 0;
}

/**
 * Clear every tracked object's path and forget it.
 */
function releaseTrackedObjects(): void {
  let failures = 0;
  let firstError: string | null = null;

  for (const api of trackedObjects) {
    try {
      // `path` is readonly in the type so ordinary code can't retarget an
      // object. This is the release; the ppal-live-api set_path operation is
      // the only other write. Assigning "" retargets the object, not the set.
      (api as unknown as { path: string }).path = "";
    } catch (error) {
      failures++;
      // ??= not ||=: a failure with an empty message is still the first one,
      // and ||= would report the second one's message in its place.
      firstError ??= errorMessage(error);
    }
  }

  trackedObjects.length = 0;

  if (failures > 0) {
    // Max console, not the tool response. warn() would put this in front of the
    // model, which can do nothing about a leaked path listener — and the release
    // runs after the response is already out, so it would land on some later
    // tool call. Reloading the device is the only fix, so tell the user.
    console.error(
      `Failed to release ${String(failures)} LiveAPI object(s): ${firstError ?? ""}`,
    );
  }
}
