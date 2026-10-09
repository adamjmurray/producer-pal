// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One spelling of where copies land, before anything reads it: a scene's whole
// destination is its position, the deprecated locator folds onto the position
// it named, and every `loc:` entry becomes the bar|beat it names.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { resolveDestinationPositions } from "#src/tools/shared/arrangement/helpers/arrangement-destination-position.ts";
import {
  paramNamesSomething,
  refuseNamedTwice,
} from "#src/tools/shared/helpers/param-presence.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import {
  parseClipDestinationList,
  pathCarriesPosition,
  refuseDoubledPosition,
} from "#src/tools/shared/validation/helpers/clip-destination-path.ts";
import { hasArrangementPosition } from "../../duplicate-destinations.ts";

/** Where the copies land, in one spelling. */
export interface SettledDestination {
  toPath?: string;
  arrangementStart?: string;
  /** Whether the copies land on the song timeline */
  onArrangement: boolean;
  /** The param the caller wrote the positions in */
  startParam: string;
}

/**
 * Settles the params that say where copies land, before anything reads them: a
 * scene's coordinate folds onto arrangementStart, the retired locator folds
 * onto it too, and every `loc:` becomes the bar|beat it names.
 * @param type - What is being duplicated
 * @param rawToPath - Destination path(s) as the caller wrote them
 * @param rawStart - Position list as the caller wrote it
 * @param locator - Deprecated locator ref list, if sent
 * @returns The two params in one spelling, whether they land on the song
 * timeline, and which param the caller wrote the positions in
 */
export function settleDestination(
  type: string | undefined,
  rawToPath: string | undefined,
  rawStart: string | undefined,
  locator: string | undefined,
): SettledDestination {
  const scene = foldSceneDestination(type, rawToPath, rawStart);
  const toPath = scene.toPath;
  const arrangementStart = resolveArrangementStart(
    type,
    scene.arrangementStart,
    locator,
  );

  return {
    toPath,
    arrangementStart,
    onArrangement: namesArrangementPosition(type, toPath, arrangementStart),
    startParam: scene.fromToPath ? "toPath" : "arrangementStart",
  };
}

// --- Helpers below main export ---

/**
 * Folds the deprecated locator param onto arrangementStart and resolves the
 * result to bar|beat only.
 *
 * A device or drum pad has no arrangement position, so neither param is read
 * and there is nothing to fold, refuse or look up. Same rule as playback, where
 * a session action drops the timeline params before the fold rather than
 * refusing a conflict between two params it will never read.
 * @param type - What is being duplicated, which decides whether these apply
 * @param arrangementStart - Position list as the caller wrote it
 * @param locator - Deprecated locator ref list, if sent
 * @returns The positions, in bar|beat, or undefined when none were named
 */
function resolveArrangementStart(
  type: string | undefined,
  arrangementStart: string | undefined,
  locator: string | undefined,
): string | undefined {
  if (type === "device" || type === "drum-pad") {
    return arrangementStart;
  }

  const positions = foldLocatorParam(arrangementStart, locator);

  // Here, not in resolveArrangementPositions, which runs once per source: one
  // mistake in the list gets one word for the call.
  targetEntries(positions, "arrangementStart");

  if (positions == null) {
    return undefined;
  }

  return resolveLocatorPositions(LiveAPI.from(livePath.liveSet), positions, {
    paramName: "arrangementStart",
  });
}

/**
 * Folds a scene's bare-coordinate destination onto arrangementStart.
 *
 * A scene copy lands clips across every track at one song position, so it has
 * no lane to name — `[5|1]` is its whole destination, and `t2[5|1]` names one
 * track a scene copy has no use for. Positions are spelled back as bar|beat
 * before they join arrangementStart's comma-separated list, so a locator name
 * holding a comma survives the trip.
 *
 * A scene's only destination is an arrangement position, so a toPath naming
 * anything else (a track, a clip slot) can't be honored at all — the call is
 * refused up front rather than silently duplicating into the session instead.
 * @param type - What is being duplicated
 * @param toPath - Destination path(s) as the caller wrote them
 * @param arrangementStart - Position list as the caller wrote it
 * @returns The two params, with a scene's coordinate moved across, and
 * whether the positions came from toPath
 */
function foldSceneDestination(
  type: string | undefined,
  toPath: string | undefined,
  arrangementStart: string | undefined,
): { toPath?: string; arrangementStart?: string; fromToPath?: true } {
  if (type !== "scene" || toPath == null || toPath.trim() === "") {
    return { toPath, arrangementStart };
  }

  if (!pathCarriesPosition(toPath)) {
    throw new Error(
      `toPath "${toPath.trim()}" names no arrangement position; a scene's ` +
        `only destination is one, written as "[5|1]"`,
    );
  }

  refuseDoubledPosition(toPath, arrangementStart, "toPath");

  const entries = resolveDestinationPositions(
    parseClipDestinationList(toPath, "toPath"),
    { paramName: "toPath" },
  );

  for (const entry of entries) {
    if (entry.lane == null) {
      continue;
    }

    throw new Error(
      `toPath "${toPath.trim()}" names a lane, but a scene ` +
        `copies across every track; name the position alone, as "[5|1]"`,
    );
  }

  return {
    arrangementStart: entries.map((entry) => entry.position).join(","),
    fromToPath: true,
  };
}

/**
 * Whether the call lands its copies on the song timeline, refusing a position
 * spelled twice on the way.
 *
 * A `[...]` in toPath says where just as arrangementStart does, so it makes the
 * call an arrangement duplicate the same way — and sending both is two
 * spellings of one position, with no combined reading and nothing run yet. Only
 * a clip's toPath can carry a coordinate; every other type's names a device or
 * a pad.
 * @param type - What is being duplicated
 * @param toPath - Destination path(s) as the caller wrote them
 * @param arrangementStart - Position list, already resolved to bar|beat
 * @returns True when the copies land on the arrangement
 */
function namesArrangementPosition(
  type: string | undefined,
  toPath: string | undefined,
  arrangementStart: string | undefined,
): boolean {
  // No other type lands copies on the timeline.
  if (type !== "clip") {
    return type === "scene" && hasArrangementPosition(arrangementStart);
  }

  refuseDoubledPosition(toPath, arrangementStart, "toPath");

  return (
    hasArrangementPosition(arrangementStart) || pathCarriesPosition(toPath)
  );
}

/**
 * Rewrites the retired locator param as the `loc:` positions it named, one per
 * entry so a list keeps naming a list.
 * @param arrangementStart - Position list as the caller wrote it
 * @param locator - Deprecated locator ref list, if sent
 * @returns The one position list
 */
function foldLocatorParam(
  arrangementStart: string | undefined,
  locator: string | undefined,
): string | undefined {
  // A blank, or the word "null", is a param left out.
  if (!paramNamesSomething(locator)) {
    return arrangementStart;
  }

  // Never pick one: the two params name the same position, so a caller who sent
  // both told us two different things about it.
  refuseNamedTwice({
    param: "arrangementStart",
    value: arrangementStart,
    noun: "position",
    also: { locator },
    hint: "locator is deprecated",
  });

  // A comma-only locator names nothing but is still sent, so it is refused as
  // naming no locator.
  const names = targetEntries(locator, "locator");

  return (names.length === 0 ? [""] : names)
    .map((name) => `loc:${name.replaceAll(",", "\\,")}`)
    .join(",");
}
