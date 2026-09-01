// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Assembling the objects a call names, when it can name them two ways at once.
//
// `id` and `path` name different objects and add up, so the targets are their
// concatenation and the count is their sum. Comparing the two to each other
// would refuse a call naming two of each.

import {
  namedIdParam,
  namedPathParam,
  targetEntries,
} from "#src/tools/shared/utils.ts";
import { countListEntries } from "#src/tools/shared/validation/list-lengths.ts";

/** The four ways a call names what to act on. */
export interface TargetParams {
  id?: string | null;
  ids?: string | null;
  path?: string | null;
  paths?: string | null;
}

/** Resolves a path list to one id per entry, null where a path named none. */
export type IdPerPath = (paths: string, tool: string) => Array<string | null>;

/**
 * How many objects a call names, without looking any of them up. Lists are
 * checked before anything touches Live, so this counts entries.
 * @param args - The call's id/ids and path/paths params
 * @returns The number of targets named
 */
export function targetCount(args: TargetParams): number {
  return (
    countListEntries(namedIdParam(args.id, args.ids, "ids")) +
    countListEntries(namedPathParam(args.path, args.paths))
  );
}

/**
 * The ids a call names, ids first, keeping one slot per entry so a caller
 * pairing them against another list keeps its positions.
 * @param args - The call's id/ids and path/paths params
 * @param tool - Tool name, for warnings
 * @param idPerPath - Resolves the path list for this kind of object
 * @returns One id per target, null where a path named nothing
 */
export function targetIds(
  args: TargetParams,
  tool: string,
  idPerPath: IdPerPath,
): Array<string | null> {
  const named = namedIdParam(args.id, args.ids, "ids");
  const paths = namedPathParam(args.path, args.paths);

  // An id that parses to nothing gets its own word even when path carries the
  // call: the combined list is still non-empty, so nothing else would notice
  // that the ids the caller asked for dropped out.
  return [
    ...targetEntries(named, "id"),
    ...(paths == null ? [] : idPerPath(paths, tool)),
  ];
}
