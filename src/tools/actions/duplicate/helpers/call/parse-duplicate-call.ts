// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  namedIdParam,
  namedPathParam,
} from "#src/tools/shared/helpers/param-presence.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import {
  pathEntries,
  refuseUnparsableEntries,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { refuseCountWithPathList } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  refuseDuplicateParamsOutsideType,
  validateAndConfigureRouteToSource,
  validateBasicInputs,
} from "../duplicate-input-validation.ts";
import { namesLaneSource } from "../sources/lane-sources.ts";
import { namesTakeLaneDestination } from "../sources/duplicate-tracks-to-lanes.ts";
import {
  type DuplicateArgs,
  type DuplicateCall,
} from "./duplicate-call-types.ts";
import { settleDestination } from "./settle-destination.ts";

/**
 * Read a duplicate call once: refuse what is malformed, and settle where the
 * copies go. Nothing here writes.
 * @param args - The tool's args
 * @returns The call, with its destination in one spelling
 * @throws Error when the call is malformed or its params don't fit its type
 */
export function parseDuplicateCall(args: DuplicateArgs): DuplicateCall {
  const { type, locator, routeToSource } = args;
  let { withoutClips, withoutDevices } = args;
  const count = args.count ?? 1;

  // A value the schema coerced from a JSON null names nothing. Counting it as
  // sent refuses the call over a param the caller deliberately left empty.
  const id = namedIdParam(args.id, args.ids, "ids");
  const path = namedPathParam(args.path, args.paths);

  validateBasicInputs(type, id, count, path);
  // Every kind of copy reads toPath its own way, so the entries that can't be
  // parsed at all are refused here, once, before any of them is read.
  refuseUnparsableEntries(args.toPath, "toPath");

  // A track copied onto a take lane — or off one, onto a track's main lane —
  // lands its clips there instead of making a new track, so the params that
  // shape a new track have nothing to act on. It is also the only copy whose
  // source can be a lane.
  const fromLane = namesLaneSource(type, id, path, args.toPath);
  const toTakeLane = namesTakeLaneDestination(type, args.toPath, fromLane);
  const laneCopy = fromLane || toTakeLane;

  // Said before the param check, which would call the same mistake a param
  // outside its action.
  if (laneCopy) {
    refuseCountWithPathList(
      count === 1 ? undefined : count,
      pathEntries(args.toPath, "toPath").length,
      "take lane",
      "t2/l0,t2/l1",
      "toPath",
    );
  }

  refuseDuplicateParamsOutsideType(type, args, laneCopy);

  if (!laneCopy) {
    ({ withoutClips, withoutDevices } = validateAndConfigureRouteToSource(
      routeToSource,
      withoutClips,
      withoutDevices,
    ));
  }

  // One spelling from here down: nothing below knows any of that.
  const dest = settleDestination(
    type,
    args.toPath,
    args.arrangementStart,
    locator,
  );

  refuseCountWithSceneDestinations(type, count, dest);

  return {
    args,
    type,
    id,
    path,
    count,
    laneCopy,
    toTakeLane,
    withoutClips,
    withoutDevices,
    toPath: dest.toPath,
    arrangementStart: dest.arrangementStart,
    onArrangement: dest.onArrangement,
    startParam: dest.startParam,
  };
}

// --- Helpers below main export ---

/**
 * Refuses `count` beside a list of scene positions. Each position is one copy,
 * so a call that says how many twice has no reading that isn't a mistake.
 * @param type - What is being duplicated
 * @param count - The count param; the schema fills in 1
 * @param dest - Where the copies go, as settled
 * @param dest.arrangementStart - The positions, in bar|beat
 * @param dest.onArrangement - Whether the copies land on the song timeline
 * @param dest.startParam - The param the caller wrote the positions in
 * @throws Error when count and a position list both say how many
 */
function refuseCountWithSceneDestinations(
  type: string,
  count: number,
  dest: {
    arrangementStart?: string;
    onArrangement: boolean;
    startParam: string;
  },
): void {
  // A lone position lays count copies end to end from it; a list is one copy
  // per position.
  if (type !== "scene" || !dest.onArrangement || count === 1) {
    return;
  }

  refuseCountWithPathList(
    count,
    targetEntries(dest.arrangementStart, "arrangementStart").length,
    "scene",
    dest.startParam === "toPath" ? "[5|1],[9|1]" : "5|1,9|1",
    dest.startParam,
  );
}
