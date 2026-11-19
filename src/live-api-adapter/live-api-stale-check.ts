// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Debug builds only: warn when something reads a LiveAPI object after the
 * request that got it has ended.
 *
 * Nothing may hold a LiveAPI object across requests (see live-api-release.ts),
 * and breaking that rule fails quietly: the pool hands the same object to a
 * later request, and the stale holder reads and writes whatever it points at
 * now. A syntax check can only catch the obvious shapes (a module-level
 * binding); a cache, a class field or a closure that outlives the call slips
 * past. So this catches the failure itself.
 *
 * Every object handed out is wrapped in a Proxy that remembers the object's
 * generation at that moment. Releasing an object bumps its generation, so a
 * wrapper from an earlier request no longer matches, and its next read or
 * write warns in the Max console. The wrapper forwards everything to the real
 * object, so code behaves the same with or without it.
 */

import { maxError } from "#src/shared/max/v8-max-console.ts";

/** How many times each object has been released. */
const generations = new WeakMap<LiveAPI, number>();

/** The real object behind each wrapper. */
const unwrapped = new WeakMap<object, LiveAPI>();

/**
 * Read on every call, not once, so tests can switch it. The build replaces the
 * read with a constant.
 * @returns Whether this build checks for stale objects
 */
function staleCheckEnabled(): boolean {
  return process.env.ENABLE_STALE_LIVE_API_CHECK === "true";
}

/**
 * Wrap an object being handed to a request, in debug builds.
 * @param api - The object, tracked for release with this request
 * @returns A wrapper that warns once if read or written after the release, or
 *   the object itself when the check is off
 */
export function guardStale(api: LiveAPI): LiveAPI {
  if (!staleCheckEnabled()) {
    return api;
  }

  const issued = generations.get(api) ?? 0;
  let warned = false;

  const check = (key: string | symbol): void => {
    if (warned || (generations.get(api) ?? 0) === issued) {
      return;
    }

    warned = true;
    maxError(
      `Stale LiveAPI object: "${String(key)}" used after the request that ` +
        `got it ended. Something held it across requests; it may now point ` +
        `at another Live object. See live-api-release.ts.`,
    );
  };

  // Methods and getters run against the real object: Live's methods need it
  // as `this`.
  const wrapper = new Proxy(api, {
    get(target, key) {
      check(key);

      const value: unknown = Reflect.get(target, key, target);

      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
    set(target, key, value) {
      check(key);

      return Reflect.set(target, key, value, target);
    },
  });

  unwrapped.set(wrapper, api);

  return wrapper;
}

/**
 * @param api - An object as a request sees it
 * @returns The real object behind a wrapper, or the object itself
 */
export function unguard(api: LiveAPI): LiveAPI {
  return unwrapped.get(api) ?? api;
}

/**
 * Note that an object was released, so every wrapper handed out for it so far
 * goes stale.
 * @param api - The real object, not a wrapper
 */
export function markReleased(api: LiveAPI): void {
  if (staleCheckEnabled()) {
    generations.set(api, (generations.get(api) ?? 0) + 1);
  }
}
