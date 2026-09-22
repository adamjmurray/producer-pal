// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The params that describe a source's copies rather than where they land: how
// many to make, and what each one leaves behind. Each pairs across the sources
// the way a destination does — one value covers them all, a list gives one per
// source in order, and nothing cycles.

import {
  countListEntries,
  requireSameLength,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  type ListEntries,
  splitList,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { plural } from "#src/tools/shared/validation/lists/plural.ts";
import {
  booleanForIndex,
  numberForIndex,
} from "#src/tools/shared/validation/lists/typed-lists.ts";
import { validateAndConfigureRouteToSource } from "../duplicate-input-validation.ts";
import { type SourceShare } from "./source-plan.ts";

/** How many copies one source makes, and what each copy leaves behind. */
export interface SourceCopyParams {
  count: number;
  withoutClips?: boolean;
  withoutDevices?: boolean;
  routeToSource?: boolean;
}

/** The same params as the caller sent them. */
export interface CopyParamArgs {
  count: string;
  withoutClips?: string;
  withoutDevices?: string;
  routeToSource?: string;
}

/**
 * Shares the per-copy params out across the sources.
 * @param args - The params as the caller sent them
 * @param sources - The sources, in call order
 * @param routeToSourceType - The type routeToSource is checked against, or
 *   undefined for a lane copy, which uses none of these params
 * @returns One set per source, in the same order
 */
export function sourceCopyParams(
  args: CopyParamArgs,
  sources: SourceShare[],
  routeToSourceType?: string,
): SourceCopyParams[] {
  if (routeToSourceType != null) {
    validateAndConfigureRouteToSource(
      routeToSourceType,
      args.routeToSource,
      args.withoutClips,
      args.withoutDevices,
    );
  }

  const named = [...new Set(sources.map((source) => source.named.param))].join(
    "/",
  );
  const each = (value: string | undefined, param: string): ListEntries | null =>
    perSourceEntries(value, param, sources.length, named);

  const counts = each(args.count, "count");
  const clips = each(args.withoutClips, "withoutClips");
  const devices = each(args.withoutDevices, "withoutDevices");
  const routed = each(args.routeToSource, "routeToSource");

  return sources.map((_unused, i) => {
    const routeToSource = booleanForIndex(args.routeToSource, i, routed);

    return {
      count: numberForIndex(args.count, i, counts) ?? 1,
      // routeToSource copies without clips or devices whatever the other two
      // said; the call was already told they were ignored.
      withoutClips:
        routeToSource === true || booleanForIndex(args.withoutClips, i, clips),
      withoutDevices:
        routeToSource === true ||
        booleanForIndex(args.withoutDevices, i, devices),
      routeToSource,
    };
  });
}

// --- Helpers below main exports ---

/**
 * One param's entries, one per source, refusing a list the sources can't pair
 * with. With one source a comma can't be a separator, and no boolean or number
 * holds one, so a comma there is a list with nowhere to go.
 * @param value - The raw param, as the caller sent it
 * @param param - The param's name, for the error message
 * @param sources - How many sources the call names
 * @param named - What named the sources, for the error message
 * @returns The entries, or null when the value covers every source
 * @throws Error when the list names a different number of sources
 */
function perSourceEntries(
  value: string | undefined,
  param: string,
  sources: number,
  named: string,
): ListEntries | null {
  const entries = countListEntries(value);

  if (sources === 1 && entries > 1) {
    throw new Error(
      `${param} names ${plural(entries, "entry")} but ${named} names one ` +
        `source. Name one value, or one source per entry.`,
    );
  }

  requireSameLength(
    { param, count: entries },
    { param: named, count: sources },
  );

  return splitList(value, sources, param);
}
