// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  paramWasSent,
  refuseParamsOutsideAction,
  type ParamHome,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";
import {
  MANAGE_ACTIONS,
  MAX_STEPS,
  type ManageAction,
} from "./helpers/manage-contract.ts";
import {
  type ManageHistoryResult,
  stepHistory,
} from "./helpers/manage-history.ts";
import {
  installFromTool,
  type ManageInstallResult,
} from "./helpers/manage-install.ts";

interface ManageArgs {
  // Plain string, not the enum, so the runtime guard below stays reachable.
  action?: string;
  userLibrary?: string;
  steps?: number | string;
}

// The only param that some actions don't read.
const MANAGE_PARAM_HOMES: Record<string, ParamHome> = {
  userLibrary: { action: ["install-remote-script"] },
  steps: { action: ["undo", "redo"] },
};

/**
 * Act on Live itself: install the Producer Pal remote script, or undo and redo
 * in Live's history.
 *
 * Not a target-list write, so it doesn't run through the write pipeline. It
 * also gets no undo step of its own: closing one right after an undo could wipe
 * Live's redo history.
 * @param args - The action, and `userLibrary` for an install
 * @param ctx - Per-request context carrying the deadline
 * @returns The install's version and path, or what Live can undo and redo now
 * @throws Error for an unknown action, a param the action doesn't read, or a
 *   step that can't run
 */
export async function manage(
  args: ManageArgs = {},
  ctx: Partial<ToolContext> = {},
): Promise<ManageInstallResult | ManageHistoryResult> {
  const { action, userLibrary, steps } = args;

  if (!isManageAction(action)) {
    const got = action == null ? "" : `, not "${action}"`;

    throw new Error(
      `action must be one of: ${MANAGE_ACTIONS.join(", ")}${got}`,
    );
  }

  refuseParamsOutsideAction({ action }, { ...args }, MANAGE_PARAM_HOMES);

  if (action === "install-remote-script") {
    return await installFromTool(userLibrary);
  }

  return await stepHistory(action, parseSteps(steps), ctx.deadline);
}

/**
 * @param action - The action as sent
 * @returns True when it is one of the actions ppal-manage runs
 */
function isManageAction(action: string | undefined): action is ManageAction {
  return MANAGE_ACTIONS.includes(action as ManageAction);
}

/**
 * The step count a call asked for. A count over the cap is refused, not cut
 * down: the caller would think it had stepped back further than it did.
 * @param steps - The `steps` param as sent
 * @returns The count, or undefined when none was sent
 * @throws Error when it isn't a whole number from 1 to the cap
 */
function parseSteps(steps: number | string | undefined): number | undefined {
  if (!paramWasSent(steps)) {
    return undefined;
  }

  const count = Number(steps);

  if (!Number.isInteger(count) || count < 1 || count > MAX_STEPS) {
    throw new Error(
      `steps must be a whole number from 1 to ${String(MAX_STEPS)}, got ${String(steps)}`,
    );
  }

  return count;
}
