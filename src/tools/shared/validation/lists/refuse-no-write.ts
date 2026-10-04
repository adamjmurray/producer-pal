// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import { isParamSent } from "#src/tools/shared/helpers/target-notes.ts";

/** The params that only name the targets, in every update tool. */
const TARGET_PARAMS = new Set(["id", "ids", "path", "paths"]);

/** Params that do nothing when false: the switches. */
const SWITCHES = new Set(["focus", "wrapInRack", "duplicateLoop"]);

/** Destinations, positions and splits: a blank one names nothing, so it is
 * unsent (unlike a blank `name`, which clears it). */
const NAMING_PARAMS = new Set([
  "toPath",
  "toSlot",
  "arrangementStart",
  "arrangementLength",
  "arrangementSplit",
  "split",
]);

/** Params that only unlock another write, so alone they write nothing. */
const MODIFIERS = new Set(["force"]);

/**
 * Refuse an update call that names its targets and asks nothing of them. Such
 * a call changes nothing, and answering with the targets reads as if it had.
 * Any other param counts as asked, including one that only does something
 * beside the write (`focus: true`; `focus: false` does nothing).
 * @param args - The call's args
 * @param objects - What the targets are, plural ("tracks"); omit for a tool
 *   with no `id` or `path` targets
 * @throws Error when no param besides the target params was sent
 */
export function refuseNoWrite(args: object, objects?: string): void {
  const asked = Object.entries(args).some(
    ([param, value]) =>
      !TARGET_PARAMS.has(param) &&
      !MODIFIERS.has(param) &&
      isParamSent(value) &&
      (!NAMING_PARAMS.has(param) || paramNamesSomething(value)) &&
      !(SWITCHES.has(param) && value === false),
  );

  if (!asked) {
    throw new Error(
      objects == null
        ? "nothing to update: send a param to change"
        : `nothing to update: id and path only name the ${objects}; also send a param to change`,
    );
  }
}
