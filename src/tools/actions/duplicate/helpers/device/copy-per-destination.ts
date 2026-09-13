// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One entry per destination a device, chain or drum-pad copy named: the copy
// that landed, or why none did (ADR-0042).

import * as console from "#src/shared/max/v8-max-console.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  attemptTarget,
  type NamedTarget,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  claimLabels,
  labelName,
  type CopyLabels,
} from "../sources/copy-labels.ts";

/**
 * Copies to every destination toPath named, keeping each one's slot.
 * @param paths - The destinations, as the caller spelled them in toPath
 * @param source - The source, as the caller named it
 * @param copyOne - Makes the copy for one destination, throwing when it can't
 * @returns One entry per destination, in the order toPath named them
 */
export function copyPerDestination<T>(
  paths: string[],
  source: NamedTarget,
  copyOne: (destination: string | undefined, index: number) => T,
): Array<T | TargetSkip> {
  // Nothing named a destination — a chain or device appending to its own rack —
  // so a refusal is addressed by the source the caller did name.
  if (paths.length === 0) {
    return [attemptTarget(source, () => copyOne(undefined, 0))];
  }

  return paths.map((path, index) =>
    attemptTarget({ param: "path", value: path }, () => copyOne(path, index)),
  );
}

/**
 * The preamble a device or chain copy shares: read toPath's destinations, claim
 * this source's share of the call's names, refuse a count it can't honor, and
 * fan out one copy per destination.
 * @param source - LiveAPI object to copy
 * @param toPath - Destination path(s), comma-separated, or omitted for the default
 * @param named - The source, as the caller named it
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @param noun - What is being copied, for the count warning
 * @param copyOne - Makes the copy for one destination, throwing when it can't
 * @returns One entry per destination, in the order toPath named them
 */
export function copyToDestinations<T>(
  source: LiveAPI,
  toPath: string | undefined,
  named: NamedTarget,
  labels: CopyLabels,
  count: number,
  noun: string,
  copyOne: (
    source: LiveAPI,
    destination: string | undefined,
    name: string | undefined,
  ) => T,
): Array<T | TargetSkip> {
  // Reads a blank toPath as omitted the way clips do, and refuses one that
  // names nothing rather than quietly falling back to the default destination.
  const paths = pathEntries(toPath, "toPath");

  claimLabels(labels, Math.max(paths.length, 1));

  if (count > 1) {
    console.warn(
      `count parameter ignored for ${noun} duplication (only single copy supported)`,
    );
  }

  // Take the id before anything moves, and rebuild the source per destination:
  // a LiveAPI object follows its path, and an earlier copy inserted at or
  // before the source's own index shifts it up — so reusing this one would
  // duplicate whatever moved into its place.
  const sourceId = source.id;

  return copyPerDestination(paths, named, (destination, index) =>
    copyOne(LiveAPI.from(sourceId), destination, labelName(labels, index)),
  );
}
