// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requireString } from "#src/mcp-server/rpc/route-string-args.ts";
import {
  checkManageArgs,
  type CheckedManageArgs,
} from "#src/tools/core/helpers/manage-args.ts";

/**
 * Check a ppal-manage call the portal answers itself. The device's checks run
 * first, so a bad call reads the same either way; the portal also has to check
 * the type of `userLibrary`, which the device's schema does for it.
 * @param args - The call's arguments as sent
 * @returns The action and the params it reads
 * @throws Error worded for the model when the call is bad
 */
export function checkedManageArgs(
  args: Record<string, unknown>,
): CheckedManageArgs {
  const checked = checkManageArgs(args);

  if (checked.userLibrary != null) {
    requireString(args, "userLibrary");
  }

  return checked;
}
