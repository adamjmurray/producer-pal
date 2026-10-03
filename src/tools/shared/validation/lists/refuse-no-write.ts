// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isParamSent } from "#src/tools/shared/helpers/target-notes.ts";

/** The params that only name the targets, in every update tool. */
const TARGET_PARAMS = new Set(["id", "ids", "path", "paths"]);

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
      isParamSent(value) &&
      !(param === "focus" && value === false),
  );

  if (!asked) {
    throw new Error(
      objects == null
        ? "nothing to update: send a param to change"
        : `nothing to update: id and path only name the ${objects}; also send a param to change`,
    );
  }
}
