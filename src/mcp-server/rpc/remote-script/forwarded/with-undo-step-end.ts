// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MANAGE_TOOL_ID } from "#src/shared/tool-groups.ts";
import { type CallLiveApiFunction } from "../../../create-mcp-server.ts";
import { isWriteCall } from "../../write-queue/write-calls.ts";
import { isChangedNothing } from "./changed-nothing.ts";
import { remoteScriptRequest } from "../remote-script-client.ts";
import { type McpResponse } from "../../../max-api-adapter.ts";
import { type RequestOverrides } from "../../../helpers/request-overrides/request-overrides.ts";

/**
 * Whether a call gets an undo step. Not ppal-manage: an end clears the guard
 * that stops its next undo from removing Producer Pal, and installing changes
 * nothing in the Set.
 *
 * @param tool - Tool name
 * @param args - The call's arguments
 * @returns True for a write call other than ppal-manage
 */
function endsUndoStep(tool: string, args: object): boolean {
  return tool !== MANAGE_TOOL_ID && isWriteCall(tool, args);
}

/** Write calls running now, across MCP and REST. */
let inFlight = 0;

/** A call in the current group timed out, so V8 may still be changing the Set. */
let groupTimedOut = false;

/**
 * A call in the current group may have changed the Set. An end also clears the
 * guard ppal-manage keeps after an undo that would remove Producer Pal, so it
 * is sent only when something may have changed.
 */
let groupMayHaveChanged = false;

/**
 * Wrap a callLiveApi so each call that can change the Set becomes one undo step.
 * A call that can't (a read action of a write tool) gets none. Live merges
 * every change into one step until something closes it, so after the last
 * running write call settles, the remote script is asked to close it, if any
 * call in the group may have changed the Set.
 *
 * A call may have changed the Set unless V8 proved it didn't (every target
 * skipped, or refused up front). A call that threw may have, so it counts.
 *
 * End only, never begin: a begin left open by a crash or timeout would merge
 * everything after it. The request isn't awaited, and any failure is dropped —
 * without a remote script, undo behaves as it did before.
 *
 * No end follows a timeout, and none follows the calls that overlapped one:
 * V8 may still be changing the Set, and an end would split that work.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that closes the undo step after write calls
 */
export function withUndoStepEnd(
  inner: CallLiveApiFunction,
): CallLiveApiFunction {
  return async (tool: string, args: object, overrides?: RequestOverrides) => {
    if (!endsUndoStep(tool, args)) {
      return await inner(tool, args, overrides);
    }

    inFlight++;

    let timedOut = false;
    let mayHaveChanged = true;

    try {
      const result = await inner(tool, args, overrides);

      timedOut = (result as McpResponse).errorCode === "timeout";
      mayHaveChanged = !isChangedNothing(result);

      return result;
    } finally {
      if (timedOut) {
        groupTimedOut = true;
      }

      if (mayHaveChanged) {
        groupMayHaveChanged = true;
      }

      inFlight--;

      if (inFlight === 0) {
        if (!groupTimedOut && groupMayHaveChanged) {
          sendUndoEnd();
        }

        groupTimedOut = false;
        groupMayHaveChanged = false;
      }
    }
  };
}

/** Ask the remote script to close the pending undo step. Never throws. */
function sendUndoEnd(): void {
  Promise.resolve()
    .then(() => remoteScriptRequest({ method: "POST", route: "/undo/end" }))
    .catch(() => {
      // No remote script, or it didn't answer: the step stays open, as before.
    });
}
