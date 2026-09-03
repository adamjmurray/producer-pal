// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { resolveLocatorPositions } from "#src/tools/shared/locator/song-position.ts";
import {
  namedIdParam,
  namedPathParam,
  targetEntries,
} from "#src/tools/shared/utils.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { focusIfRequested } from "./helpers/duplicate-focus-helpers.ts";
import { copyLabels } from "./helpers/sources/duplicate-label-helpers.ts";
import {
  duplicateChainSources,
  duplicateOneSource,
} from "./helpers/sources/duplicate-run-source-helpers.ts";
import {
  planSources,
  resolveSourceClipDestinations,
} from "./helpers/sources/duplicate-source-helpers.ts";
import { applyTransformsToDuplicatedClips } from "./helpers/clip/duplicate-transform-helpers.ts";
import {
  hasArrangementPosition,
  resolveDestinationAndWarn,
  validateBasicInputs,
  validateAndConfigureRouteToSource,
} from "./helpers/duplicate-validation-helpers.ts";

interface DuplicateArgs {
  type: string;
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  count?: number;

  arrangementStart?: string;
  /** Deprecated: locator ref(s), folded onto arrangementStart as `loc:` */
  locator?: string;
  arrangementLength?: string;
  name?: string;
  color?: string;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
  focus?: boolean;
  toSlot?: string;
  toPath?: string;
  transforms?: string;
  code?: string;
  takeLane?: number | string;
  takeLaneName?: string;
}

/**
 * Duplicates an object based on its type.
 * @param args - The parameters
 * @param args.type - Object type to duplicate
 * @param args.id - Object ID(s), comma-separated to copy several sources
 * @param args.ids - Hidden alias for id
 * @param args.path - Source path(s), comma-separated, instead of or alongside id
 * @param args.paths - Hidden alias for path
 * @param args.count - Number of duplicates
 * @param args.arrangementStart - Arrangement position(s): bar|beat or `loc:<locator>`
 * @param args.locator - Deprecated locator ref(s); use arrangementStart
 * @param args.arrangementLength - Arrangement length
 * @param args.name - Name for duplicates
 * @param args.color - Color for all the copies, or comma-separated one per copy
 * @param args.withoutClips - Exclude clips
 * @param args.withoutDevices - Exclude devices
 * @param args.routeToSource - Route to source
 * @param args.focus - Focus duplicated clip/scene
 * @param args.toSlot - Deprecated destination clip slot(s); use toPath
 * @param args.toPath - Destination path(s): track, clip slot, or device
 * @param args.transforms - Transform expressions broadcast across all copies
 * @param args.code - JavaScript function body broadcast across all copies
 * @param args.takeLane - Arrangement take lane target for clips (0/omitted = main, 1+, "new")
 * @param args.takeLaneName - Name for a take lane newly created by this call
 * @param context - Context object
 * @returns Result object(s)
 */
export async function duplicate(
  {
    type,
    id,
    ids,
    path,
    paths,
    count = 1,
    arrangementStart,
    locator,
    arrangementLength,
    name,
    color,
    withoutClips,
    withoutDevices,
    routeToSource,
    focus,
    toSlot,
    toPath,
    transforms,
    code,
    takeLane,
    takeLaneName,
  }: DuplicateArgs,
  context: Partial<ToolContext> = {},
): Promise<object | object[]> {
  // A value the schema coerced from a JSON null names nothing. Counting it as
  // sent refuses the call over a param the caller deliberately left empty.
  id = namedIdParam(id, ids, "ids");
  path = namedPathParam(path, paths);

  // Validate basic inputs
  validateBasicInputs(type, id, count, path);

  // Auto-configure for routing back to source
  ({ withoutClips, withoutDevices } = validateAndConfigureRouteToSource(
    type,
    routeToSource,
    withoutClips,
    withoutDevices,
  ));

  // One spelling from here down: the deprecated locator folds onto the position
  // it named, and every `loc:` entry becomes the bar|beat it names. Nothing
  // below this line knows a locator can be written at all.
  arrangementStart = resolveArrangementStart(type, arrangementStart, locator);

  const hasArrangementParams = hasArrangementPosition(arrangementStart);
  // A container destination — a track's arrangement or a take lane on it — holds
  // many copies and tells them apart by position, so every source can have the
  // whole list. A clip slot, device slot or drum pad holds one object, so the
  // list is shared out instead of copied over itself.
  const sources = planSources({
    type,
    id,
    path,
    toPath,
    toSlot,
    broadcasts: type === "clip" && hasArrangementParams,
  });

  // A bad id partway through a list would leave the copies before it behind, so
  // check every source before the first one is made.
  if (sources.length > 1) {
    for (const source of sources) {
      validateIdType(source.id, type, "duplicate");
    }
  }

  // Resolve a clip's destination up front, so a bad path fails before anything
  // is created. Other types have no destination path.
  const clipDestinations =
    type === "clip"
      ? resolveSourceClipDestinations(sources, hasArrangementParams)
      : null;

  const destination = resolveDestinationAndWarn({
    type,
    sources,
    // Every source's destination is the same kind, and the warnings are about
    // the params rather than the places, so one of them speaks for the call.
    clipDestinations: clipDestinations?.[0] ?? null,
    count,
    toPath,
    toSlot,
    arrangementStart,
    arrangementLength,
    takeLane,
    takeLaneName,
    transforms,
    code,
  });

  const labels = copyLabels(name, color, sources.length);

  // Both of these take comma-separated toPath for multiple destinations
  if (type === "drum-pad" || type === "device" || type === "chain") {
    return duplicateChainSources(type, sources, labels, count);
  }

  const createdObjects: object[] = [];

  for (const [i, source] of sources.entries()) {
    createdObjects.push(
      ...(await duplicateOneSource({
        type,
        source,
        destination,
        clipDestinations: clipDestinations?.[i] ?? null,
        count,
        labels,
        params: {
          arrangementStart,
          arrangementLength,
          withoutClips,
          withoutDevices,
          routeToSource,
        },
        takeLane,
        takeLaneName,
        context,
      })),
    );
  }

  // Apply transforms/code to the duplicated clips (per-clip via update-clip DSL)
  if (type === "clip" && (transforms != null || code != null)) {
    await applyTransformsToDuplicatedClips(
      createdObjects,
      transforms,
      code,
      context,
    );
  }

  // Handle view switching if requested
  focusIfRequested(focus, destination, type, createdObjects);

  // Return single object or array based on results
  if (createdObjects.length === 1) {
    return createdObjects[0] as object;
  }

  return createdObjects;
}

/**
 * Folds the deprecated locator param onto arrangementStart and resolves the
 * result to bar|beat only.
 *
 * A device or drum pad has no arrangement position, so neither param is read
 * and there is nothing to fold, refuse or look up — warnUnusedArrangementParams
 * says they were ignored instead. Same rule as playback, where a session action
 * drops the timeline params before the fold rather than refusing a conflict
 * between two params it will never read.
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
  if (type === "device" || type === "drum-pad") return arrangementStart;

  const positions = foldLocatorParam(arrangementStart, locator);

  // Here, not in resolveArrangementPositions, which runs once per source: one
  // mistake in the list gets one word for the call.
  targetEntries(positions, "arrangementStart");

  if (positions == null) return undefined;

  return resolveLocatorPositions(LiveAPI.from(livePath.liveSet), positions, {
    toolName: "duplicate",
    paramName: "arrangementStart",
  });
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
  if (locator == null) return arrangementStart;

  // Never pick one: the two params name the same position, so a caller who sent
  // both told us two different things about it.
  if (arrangementStart != null && arrangementStart.trim() !== "") {
    throw new Error(
      "duplicate failed: arrangementStart and locator are mutually exclusive",
    );
  }

  return locator
    .split(",")
    .map((entry) => `loc:${entry.trim()}`)
    .join(",");
}
