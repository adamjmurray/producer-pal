// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The locators a call names, as targets of the write pipeline. Two targets that
// name one locator share a key, so the last acts on it: acting twice would
// toggle a cue off and back on, or create one where the first act deleted it.
// Keys are worked out before anything is written, while every target can still
// be looked up.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { findLocatorsByName } from "#src/tools/shared/locator/locators.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type LocatorParam,
  type LocatorTarget,
  type SongMeter,
  locateTarget,
} from "./locator-targets.ts";

/** What a locator target carries into its write. */
export interface LocatorPayload {
  target: LocatorTarget;
}

/** How an entry spells the param that named a locator. */
const ENTRY_SPELLING: Record<LocatorParam, NamedTarget["param"]> = {
  locatorId: "id",
  locatorTime: "time",
  locatorName: "name",
};

/**
 * The call's locators as pipeline targets, each addressed in the caller's own
 * spelling.
 * @param liveSet - The live_set LiveAPI object
 * @param targets - The locators the call names, in order
 * @param meter - The song meter a bar|beat is read in
 * @returns One target per locator
 */
export function locatorPipelineTargets(
  liveSet: LiveAPI,
  targets: LocatorTarget[],
  meter: SongMeter,
): Array<Target<LocatorPayload>> {
  return targets.map((target) => ({
    named: {
      param: ENTRY_SPELLING[target.param],
      value: target.value as string,
    },
    // A lone locator has nothing to share with, so skip the lookup.
    ...(targets.length > 1 && { keys: keysOf(liveSet, target, meter) }),
    data: { target },
  }));
}

// --- Helpers below main exports ---

/**
 * Every locator a target names: ids where a locator is there, otherwise the
 * time or spelling it would act on. A name can match several locators, and an
 * id or time names one.
 * @param liveSet - The live_set LiveAPI object
 * @param target - One target
 * @param meter - The song meter a bar|beat is read in
 * @returns The keys
 */
function keysOf(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): string[] {
  const value = target.value as string;

  if (target.param === "locatorName") {
    const matches = findLocatorsByName(liveSet, value);

    return matches.length > 0
      ? matches.map((match) => `locator:${match.locator.id}`)
      : [`name:${value}`];
  }

  const { beats, found } = locateTarget(liveSet, target, meter);

  if (found != null) {
    return [`locator:${found.locator.id}`];
  }

  // Times closer than the epsilon are one time.
  return [
    target.param === "locatorId"
      ? `id:${value}`
      : `time:${Math.round((beats as number) / SAME_TIME_EPSILON)}`,
  ];
}
