// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MANAGE_TOOL_ID } from "#src/shared/tool-groups.ts";
import { isWriteCall } from "../../write-queue/write-calls.ts";
import { isChangedNothing } from "./changed-nothing.ts";
import { remoteScriptRequest } from "../remote-script-client.ts";
import { type McpResponse } from "../../../max-api-adapter.ts";

/**
 * Longest the write queue holds the next write for the remote script to close
 * a step. Past it, the next write's changes may join this step, as they would
 * with no remote script.
 */
export const UNDO_END_WAIT_MS = 1000;

/**
 * Slack between the end's deadline and the queue's release: the end is sent a
 * moment after the queue starts waiting.
 */
const UNDO_END_MARGIN_MS = 50;

/**
 * How long Live may leave the end queued, counted from this call. The deadline
 * falls before the queue releases the next write, and `end_undo_step` runs whole
 * on Live's main thread. So an end that starts by the deadline finishes before
 * any later write changes anything, and one that starts later is skipped.
 */
export const UNDO_END_EXPIRES_IN_MS = UNDO_END_WAIT_MS - UNDO_END_MARGIN_MS;

/**
 * Close Live's pending undo step after a write call, so each call is its own
 * step. Live merges every change into one step until something closes it.
 * The write queue runs this after each write and holds the next one until it
 * settles; the caller already has its answer.
 *
 * No end when V8 proved the call changed nothing (every target skipped, or
 * refused up front): an end also clears the guard ppal-manage keeps after an
 * undo that would remove Producer Pal. A call that threw may have changed the
 * Set, so it gets one. ppal-manage never does: installing changes nothing in
 * the Set, and an end would clear that guard.
 *
 * End only, never begin: a begin left open by a crash or timeout would merge
 * everything after it. The end carries an expiry (UNDO_END_EXPIRES_IN_MS), so
 * one Live gets to after the queue has moved on is skipped rather than closing
 * the next write's step halfway. Any failure is dropped; without a remote
 * script, undo behaves as it did before.
 *
 * @param tool - Tool name
 * @param args - The call's arguments
 * @param response - V8's answer, or undefined when the call threw
 * @returns Settles once the step is closed or UNDO_END_WAIT_MS has passed;
 *   undefined when the call gets no end
 */
export function endUndoStep(
  tool: string,
  args: object,
  response: McpResponse | undefined,
): Promise<void> | undefined {
  if (tool === MANAGE_TOOL_ID || !isWriteCall(tool, args)) {
    return undefined;
  }

  if (response != null && isChangedNothing(response)) {
    return undefined;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, UNDO_END_WAIT_MS);

    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };

    Promise.resolve()
      .then(() =>
        remoteScriptRequest({
          method: "POST",
          route: "/undo/end",
          expiresInMs: UNDO_END_EXPIRES_IN_MS,
        }),
      )
      // No remote script, or it didn't answer: the step stays open, as before.
      .then(done, done);
  });
}
