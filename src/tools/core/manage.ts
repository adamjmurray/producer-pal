// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { PORTAL_SOURCES } from "#src/shared/config.ts";
import { checkManageArgs, type ManageArgs } from "./helpers/manage-args.ts";
import { type ManageInstallResult } from "./helpers/manage-contract.ts";
import {
  type ManageHistoryResult,
  stepHistory,
} from "./helpers/manage-history.ts";
import { installFromTool } from "./helpers/manage-install.ts";

/**
 * Act on Live itself: install the Producer Pal remote script, or undo and redo
 * in Live's history. Adding Producer Pal to a Set only works while it isn't
 * running, and updating it replaces the running device, so here both are
 * refused (the portal answers them).
 *
 * Not a target-list write, so it doesn't run through the write pipeline. It
 * also gets no undo step of its own: closing one right after an undo could wipe
 * Live's redo history.
 * @param args - The action, and `userLibrary` for an install
 * @param ctx - Per-request context carrying the deadline
 * @returns The install's version and path, or what Live can undo and redo now
 * @throws Error for an unknown action, a param the action doesn't read, a
 *   step that can't run, `add-producer-pal` (Producer Pal is running), or
 *   `update-producer-pal` (only the portal runs it)
 */
export async function manage(
  args: ManageArgs = {},
  ctx: Partial<ToolContext> = {},
): Promise<ManageInstallResult | ManageHistoryResult> {
  const { action, userLibrary, steps } = checkManageArgs(args);

  if (action === "install-remote-script") {
    return await installFromTool(userLibrary);
  }

  if (action === "add-producer-pal") {
    throw new Error("Producer Pal is already running in this Live Set");
  }

  if (action === "update-producer-pal") {
    throw new Error(
      `update-producer-pal runs through the portal (${PORTAL_SOURCES}). This call didn't come through one, or the portal is too old for it. Tell the user to update the Producer Pal device by hand.`,
    );
  }

  return await stepHistory(action, steps, ctx.deadline);
}
