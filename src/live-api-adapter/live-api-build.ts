// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Where every LiveAPI object comes from: the memo, the pool, or a fresh build.
 * `LiveAPI.from` and the collection accessors in live-api-extensions.ts are the
 * only callers.
 *
 * Tools resolve the same handful of paths over and over in one request —
 * live_set once per clip to read the Set's scale, this_device once per track to
 * find the host — and each repeat used to take another object off the pool. The
 * memo hands back the one already resolved, and is emptied along with the
 * tracked objects when the last scope closes, so nothing survives the request
 * (see live-api-release.ts).
 *
 * ONLY THE PATHS BELOW GO IN IT, AND THE REASON IS THE WHOLE DESIGN.
 *
 * A memo is only safe for a target whose meaning cannot change while the memo
 * holds it. That is a much shorter list than it looks:
 *
 *   - An id target is out. At mode 0 an id resolves to a path once and follows
 *     that path afterward, so after a mutation it can name a different object
 *     than a fresh lookup of the same id would. Delete depends on the
 *     difference — it re-looks-up the id to find out whether the delete landed,
 *     because the object the delete ran through still reports its old id.
 *
 *   - An ordinary path is out too. Tools read a path, mutate, then read the
 *     same path again to compare: copyClipToSlot reads the destination slot's
 *     clip id, calls duplicate_clip_to, and re-reads to tell a real copy from
 *     the clip that was already sitting there. Handing back the first object
 *     turns every copy into "no clip landed".
 *
 * Invalidating on mutation instead was considered and rejected: there is no
 * complete list of mutations to hook. Method calls could be caught, but writing
 * selected_track, selected_scene, detail_clip or highlighted_clip_slot moves
 * what a *path* names without a method call, and the user editing the Set while
 * a request is in flight has no hook at all. A rule that has to be remembered
 * at every future call site buys speed with silent wrong answers.
 *
 * What is left is targets that name one object for the life of the Live Set.
 * There is exactly one Song, one Application, one master track, and one
 * Producer Pal device, and no tool, user, or concurrent request can repoint any
 * of them. Repeats of anything else are fixed where they happen, by resolving
 * once and passing the object down.
 */

import { NONEXISTENT_ID } from "./live-api-path-utils.ts";
import {
  acquirePooledObject,
  memoizeObject,
  memoizedObject,
  trackLiveApiObject,
} from "./live-api-release.ts";

/**
 * The only targets that may be memoized. Each names one LOM object that exists
 * for as long as the Live Set does. Do not add a path with an index in it, and
 * do not add a view pointer like `live_set view selected_track` — those name
 * whatever is selected right now.
 */
const STABLE_TARGETS = new Set([
  "live_app",
  "live_app view",
  "live_set",
  "live_set master_track",
  "live_set view",
  "this_device",
]);

/**
 * Point a pooled object at an "id N" target.
 *
 * Assigning the bare id is the only form that retargets. Measured on 12.4.3, a
 * cleared object given 106 came back at "live_set tracks 0 clip_slots 0 clip"
 * with the clip's name and length; the same value as "id 106" wipes the object,
 * and goto() ignores it either way.
 *
 * A bad id doesn't throw — it leaves the object wherever it already was, so the
 * write is read back. From a cleared object that's "nowhere", which is the right
 * answer for a bad id and counts as success. Anything else means Live ignored
 * the write and the object still points at the last request's target.
 *
 * @param api - The pooled object, its path already cleared
 * @param id - The target id, no "id " prefix
 * @returns Whether the object now points at that id, or at nothing
 */
function retargetToId(api: LiveAPI, id: string): boolean {
  (api as unknown as { id: string }).id = id;

  return api.id === id || api.id === NONEXISTENT_ID;
}

/**
 * Point a pooled object at a target, or build one when the pool is empty.
 *
 * Construction is what registers a context in MxDCore, and nothing takes that
 * back short of a device reload, so reuse is much cheaper than a fresh object.
 * See live-api-release.ts for what pooling does and doesn't buy.
 *
 * @param target - Path or "id N" string, already normalized
 * @returns A tracked object pointing at the target
 */
function acquireObject(target: string): LiveAPI {
  const pooled = acquirePooledObject();

  if (pooled == null) {
    return trackLiveApiObject(new LiveAPI(target));
  }

  // Track before retargeting: an object that throws partway through is off the
  // free list already, and leaving it untracked too would strand what it armed.
  trackLiveApiObject(pooled);

  if (!target.startsWith("id ")) {
    pooled.goto(target);

    return pooled;
  }

  if (retargetToId(pooled, target.slice(3))) {
    return pooled;
  }

  // Only reachable if a non-cleared object reached the free list, which the
  // release guard exists to prevent. Building is what this did before pooling
  // covered id targets, so the fallback is just the old behavior.
  return trackLiveApiObject(new LiveAPI(target));
}

/**
 * Resolve a target, reusing this request's object when the target is one of the
 * stable few.
 *
 * A hit is checked with exists() before it is handed back, so a Live version
 * that drops one of these paths costs a rebuild rather than a wrong answer.
 *
 * @param target - Path or "id N" string, already normalized
 * @returns A tracked object pointing at the target
 */
export function buildOrReuse(target: string): LiveAPI {
  if (!STABLE_TARGETS.has(target)) {
    return acquireObject(target);
  }

  const memoized = memoizedObject(target);

  if (memoized != null && memoized.exists()) {
    return memoized;
  }

  const api = acquireObject(target);

  memoizeObject(target, api);

  return api;
}
