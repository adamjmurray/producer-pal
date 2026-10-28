// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { remoteScriptChange } from "#src/tools/shared/remote-script/remote-script-route.ts";
import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import {
  type HistoryAction,
  type HistoryResult,
  MANAGE_ROUTES,
} from "./manage-contract.ts";

/**
 * How many steps were taken (`undone` or `redone`), what Live can undo and redo
 * after them, and why fewer were taken than asked, when they were.
 */
export type ManageHistoryResult = ({ undone: number } | { redone: number }) & {
  canUndo: boolean;
  canRedo: boolean;
  stopped?: string;
};

/**
 * Undo or redo steps in Live's history, through the remote script.
 *
 * A failure after the request went out says the step may have been applied:
 * Live may have acted before the answer was lost, and "nothing happened" would
 * send the caller to repeat it.
 * @param action - undo or redo
 * @param steps - How many steps; absent means one
 * @param deadline - The request deadline from ToolContext, if any
 * @returns What Live can undo and redo now
 * @throws Error when the remote script is missing or too old, Live has nothing
 *   to step, or the step's outcome is unknown
 */
export async function stepHistory(
  action: HistoryAction,
  steps?: number,
  deadline?: number | null,
): Promise<ManageHistoryResult> {
  const outcome = await remoteScriptChange<HistoryResult>(
    MANAGE_ROUTES[action],
    steps == null ? {} : { steps },
    deadline,
    `${action} needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`,
  );

  if (outcome.ok) {
    const { done, stopped, can_undo, can_redo } = outcome.result;

    return {
      [action === "undo" ? "undone" : "redone"]: done,
      canUndo: can_undo,
      canRedo: can_redo,
      ...(stopped != null && { stopped }),
    } as ManageHistoryResult;
  }

  if (outcome.stalled === "unanswered") {
    throw new Error(
      `${outcome.reason}; the ${action} may have been applied. Read the Live Set to check before trying again`,
    );
  }

  if (outcome.stalled === "out-of-time") {
    throw new Error(
      `${outcome.reason}; the ${action} wasn't started, re-run it`,
    );
  }

  throw new Error(outcome.reason);
}
