// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Releases the path listeners Live arms behind every LiveAPI object.
 *
 * Live installs a listener on each collection along a path-based object's path
 * (live_set.tracks, track.devices, ...) and never takes them down. Assigning an
 * empty path is the only thing that does. Every armed listener has to be
 * notified on any later structural change to the Live Set, so unreleased
 * objects make those changes slower: on 12.4.3, adding and deleting a track
 * took 120 ms with none held and 630 ms with 7,190 held. Clearing the paths
 * gives all of it back.
 *
 * So objects are tracked as they are built and released when the request that
 * built them ends. Identity and lifetime *within* a request are untouched.
 *
 * ============================================================================
 * NOTHING MAY HOLD A LiveAPI OBJECT ACROSS REQUESTS.
 *
 * Not in module state, not in a cache, not captured in a callback that outlives
 * the call. Every object a request builds is released when it ends, and reused
 * by a later one.
 *
 * A stale reference fails quietly. Straight after release it at least reads as
 * nonexistent — cleared path, id "0". Once the object is recycled it points at
 * something else entirely, and reads and writes land on the wrong Live object
 * with no error anywhere.
 *
 * Build objects where you use them. Nothing in the codebase holds one across
 * requests today; keep it that way.
 *
 * Mode 1 (follow the object) is not the way around this — it is the worst case
 * measured. The same 7,190 held objects at mode 1 took that track add and
 * delete to 5.7 s, nine times the mode 0 cost. Caching by id across requests
 * is the most expensive thing you can do here.
 * ============================================================================
 *
 * Clearing the path is not the whole story, which is why released objects are
 * pooled rather than dropped. Construction registers a context in MxDCore that
 * clearing the path does not take back, and only a device reload clears it. So
 * a released object goes on a free list and the next request retargets it.
 *
 * That costs two ways, and pooling avoids both. Building an object runs about
 * 14 ms slower than retargeting a pooled one, and each build also slows every
 * later read a little. Measured on 12.4.3 over 2,500 read-track calls: pooled,
 * a read went from 54 ms to 90 ms; unpooled, from 534 ms to 1.1 s. Same work
 * either way — 90,006 objects, 92% of them reused when the pool is on.
 *
 * Pooling does not make the cost vanish, and measuring it as though it should
 * will read as failure. Visiting a path registers something too, so latency
 * still rises while a session reaches new corners of the Live Set — that 54 to
 * 90 ms is the pool working, not failing. The difference is that the path cost
 * is paid once per path and saturates, while the construction cost never does.
 *
 * Don't reach for freepeer(), and don't count on the garbage collector. Both
 * free the JS peer and leave the listener armed, and the slowdown then never
 * comes back: 7,190 objects in that state held a track add and delete at 1.0 s
 * (freepeer) and 3.5 s (collected) until the device was reloaded.
 */

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

const trackedObjects: LiveAPI[] = [];

/**
 * Ceiling on the free list.
 *
 * Without one it grows forever. A request returns every object it built, but
 * only takes back the ones it needed for a path — an "id N" target can't
 * retarget an existing object, so getChildren always builds. Every request
 * therefore hands back more than it took, and the surplus is exactly the
 * id-built objects. A read-track loop would pile up tens of thousands.
 *
 * Anything over the ceiling is released and dropped. A request that needs more
 * than this builds the difference, which is what it did before pooling existed.
 * Set high enough to cover an ordinary request and low enough to stay
 * negligible memory.
 */
export const MAX_POOLED_OBJECTS = 512;

/**
 * Released objects with a cleared path, waiting to be retargeted.
 *
 * Only ever refilled when the last open scope closes, which is what keeps a
 * reused object from being handed to two requests at once. Requests overlap
 * whenever a tool awaits, and there is no way to tell which request is calling
 * — LiveAPI.from is a global with no request handle and Max V8 has no async
 * context — so "nothing is in flight" is the only safe moment to recycle.
 *
 * The cost is that concurrent requests never reach that moment, so the pool
 * stays empty and every object is built. That is today's behavior, not a
 * regression, and sequential calls (the normal case) recycle every request.
 */
const freeObjects: LiveAPI[] = [];

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

/**
 * Take an idle object off the free list, if there is one.
 *
 * The caller retargets it and tracks it. Returns undefined when the pool is
 * empty, which is the signal to build one instead.
 *
 * @returns A pooled object with a cleared path, or undefined
 */
export function acquirePooledObject(): LiveAPI | undefined {
  return freeObjects.pop();
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

/** Drop tracked and pooled objects without releasing them. For test setup only. */
export function resetLiveApiTracking(): void {
  trackedObjects.length = 0;
  freeObjects.length = 0;
  openScopes = 0;
}

/**
 * Clear every tracked object's path and move it to the free list.
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

      // The only writable state on the wrapper, and the ppal-live-api set_mode
      // operation can leave it at 1 (follow the object, not the path). Reusing
      // the object without resetting would carry that into the next request.
      api.mode = 0;

      // Only after the clear succeeds. An object that refused is in an unknown
      // state, so reusing it would hand a request something still pointing at
      // the last request's target.
      if (freeObjects.length < MAX_POOLED_OBJECTS) {
        freeObjects.push(api);
      }
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
