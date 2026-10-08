// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
 * running, so here it is refused (the portal answers it).
 *
 * Not a target-list write, so it doesn't run through the write pipeline. It
 * also gets no undo step of its own: closing one right after an undo could wipe
 * Live's redo history.
 * @param args - The action, and `userLibrary` for an install
 * @param ctx - Per-request context carrying the deadline
 * @returns The install's version and path, or what Live can undo and redo now
 * @throws Error for an unknown action, a param the action doesn't read, a
 *   step that can't run, or `add-producer-pal` (Producer Pal is running)
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

  return await stepHistory(action, steps, ctx.deadline);
}
