// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { warnIgnored } from "#src/shared/max/ignored-wording.ts";
import { DUPLICATE_TYPES } from "#src/tools/constants.ts";
import { isTakeLaneRequested } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  type ParamHome,
  refuseParamsOutsideAction,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";

/**
 * Validates basic input parameters for duplication
 * @param type - Type of object to duplicate
 * @param id - ID(s) of the object(s) to duplicate
 * @param count - Number of duplicates to create
 * @param path - Path(s) of the object(s) to duplicate
 */
export function validateBasicInputs(
  type: string,
  id: string | undefined,
  count: number,
  path?: string,
): void {
  if (!type) {
    throw new Error("type is required");
  }

  if (!(DUPLICATE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of ${DUPLICATE_TYPES.join(", ")}`);
  }

  // `id` and `path` name different objects and add up, so either will do and
  // both together are a longer source list, not a conflict.
  if (id == null && path == null) {
    throw new Error("id or path is required");
  }

  if (count < 1) {
    throw new Error("count must be at least 1");
  }
}

/**
 * Validates and configures route to source parameters. Only a track call gets
 * here with routeToSource: any other type was refused up front.
 * @param routeToSource - Whether to route to source track
 * @param withoutClips - Whether to exclude clips
 * @param withoutDevices - Whether to exclude devices
 * @returns Configured withoutClips and withoutDevices values
 */
export function validateAndConfigureRouteToSource(
  routeToSource: boolean | undefined,
  withoutClips: boolean | undefined,
  withoutDevices: boolean | undefined,
): { withoutClips: boolean | undefined; withoutDevices: boolean | undefined } {
  if (!routeToSource) {
    return { withoutClips, withoutDevices };
  }

  // About the call, not about any one copy: routeToSource settles both params
  // before the sources are even read.
  const ignored = [
    ...(withoutClips === false ? ["withoutClips"] : []),
    ...(withoutDevices === false ? ["withoutDevices"] : []),
  ];

  if (ignored.length > 0) {
    warnIgnored(
      ignored,
      "routeToSource always copies without clips and devices",
    );
  }

  return { withoutClips: true, withoutDevices: true };
}

/**
 * Validates destination parameter compatibility with object type
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 * @param laneCopy - Whether the call copies clips lane to lane
 */
export function validateDestinationParameter(
  type: string,
  destination: string | undefined,
  laneCopy = false,
): void {
  if (type !== "track" || destination !== "arrangement") {
    return;
  }

  // A lane copy does land on the arrangement — it just has no position to take,
  // since every clip keeps the one it has.
  throw new Error(
    laneCopy
      ? "arrangementStart doesn't apply to a lane copy: every clip keeps its own position; drop it"
      : "tracks cannot be duplicated to arrangement",
  );
}

const COPIES_MADE_IN_BULK: ParamHome = { type: ["track", "scene"] };
const CLIPS: ParamHome = { type: ["clip"] };
const ON_THE_TIMELINE: ParamHome = { type: ["track", "scene", "clip"] };

// The types that read each param. The rest copy inside a rack or track, or one
// copy per destination, and have no use for it.
const DUPLICATE_PARAM_HOMES: Record<string, ParamHome> = {
  count: COPIES_MADE_IN_BULK,
  withoutClips: COPIES_MADE_IN_BULK,
  withoutDevices: { type: ["track"] },
  routeToSource: { type: ["track"] },
  transforms: CLIPS,
  code: CLIPS,
  toSlot: CLIPS,
  takeLane: CLIPS,
  takeLaneName: { type: ["clip", "track"] },
  arrangementStart: ON_THE_TIMELINE,
  locator: ON_THE_TIMELINE,
  arrangementLength: { type: ["clip", "scene"] },
};

/**
 * Refuses a duplicate call that sends a param its type doesn't read, or that a
 * lane copy has no use for: it copies clips onto a lane and makes no track.
 * @param type - The type being duplicated
 * @param args - The args as sent
 * @param laneCopy - Whether the call copies clips onto a take lane
 */
export function refuseDuplicateParamsOutsideType(
  type: string,
  args: object,
  laneCopy = false,
): void {
  const sent: Record<string, unknown> = { ...args };

  // The schema fills count in, and a false flag or the main lane asks for nothing.
  for (const [param, asksForNothing] of [
    ["count", sent.count === 1],
    ["routeToSource", sent.routeToSource === false],
    ["withoutClips", sent.withoutClips === false],
    ["withoutDevices", sent.withoutDevices === false],
    ["takeLane", !isTakeLaneRequested(sent.takeLane as string | number)],
  ] as const) {
    if (asksForNothing) {
      delete sent[param];
    }
  }

  refuseParamsOutsideAction({ type }, sent, DUPLICATE_PARAM_HOMES);

  // A lane holds clips and nothing else, so the params that shape a new track
  // have nothing to act on.
  if (laneCopy) {
    refuseParamsOutsideAction({ destination: "lane" }, sent, NEW_TRACK_PARAMS);
  }
}

const NEW_TRACK: ParamHome = { destination: ["new track"] };

// What only a copy that makes a new track reads.
const NEW_TRACK_PARAMS: Record<string, ParamHome> = {
  count: NEW_TRACK,
  withoutClips: NEW_TRACK,
  withoutDevices: NEW_TRACK,
  routeToSource: NEW_TRACK,
};
