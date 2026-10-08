// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How ppal-manage reads its arguments, for the device and for the portal when
// the device is offline. No V8 code in here: the portal bundles it.

import {
  paramWasSent,
  refuseParamsOutsideAction,
  type ParamHome,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";
import {
  MANAGE_ACTIONS,
  MAX_STEPS,
  type ManageAction,
} from "./manage-contract.ts";

/** The arguments as a client sent them. */
export interface ManageArgs {
  // Plain string, not the enum, so the runtime guard below stays reachable.
  action?: string;
  userLibrary?: string;
  steps?: number | string;
}

/** Arguments that passed the checks. */
export interface CheckedManageArgs {
  action: ManageAction;
  userLibrary?: string;
  steps?: number;
}

// The only params that some actions don't read.
const MANAGE_PARAM_HOMES: Record<string, ParamHome> = {
  userLibrary: { action: ["install-remote-script", "add-producer-pal"] },
  steps: { action: ["undo", "redo"] },
};

/**
 * Check a ppal-manage call before anything runs.
 * @param args - The arguments as sent
 * @returns The action, and the params it reads
 * @throws Error for an unknown action, a param the action doesn't read, or a
 *   step count that can't run
 */
export function checkManageArgs(args: ManageArgs): CheckedManageArgs {
  const { action, userLibrary, steps } = args;

  if (!isManageAction(action)) {
    const got = action == null ? "" : `, not "${action}"`;

    throw new Error(
      `action must be one of: ${MANAGE_ACTIONS.join(", ")}${got}`,
    );
  }

  refuseParamsOutsideAction({ action }, { ...args }, MANAGE_PARAM_HOMES);

  return { action, userLibrary, steps: parseSteps(steps) };
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
