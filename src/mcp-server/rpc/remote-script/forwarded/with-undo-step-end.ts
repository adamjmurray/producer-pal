// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MANAGE_TOOL_ID } from "#src/shared/tool-groups.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  STANDARD_TOOL_DEFS,
  type CallLiveApiFunction,
} from "../../../create-mcp-server.ts";
import { remoteScriptRequest } from "../remote-script-client.ts";
import { type McpResponse } from "../../../max-api-adapter.ts";
import { type RequestOverrides } from "../../../helpers/request-overrides/request-overrides.ts";

/**
 * Tools that may change the Set, read off their defs. Not ppal-manage: closing
 * a step right after an undo could wipe Live's redo history, and installing
 * changes nothing in the Set.
 */
const WRITE_TOOLS: ReadonlySet<string> = new Set(
  [...STANDARD_TOOL_DEFS, toolDefLiveApi]
    .filter(
      (def) =>
        def.toolOptions.annotations?.readOnlyHint !== true &&
        def.toolName !== MANAGE_TOOL_ID,
    )
    .map((def) => def.toolName),
);

/** Write calls running now, across MCP and REST. */
let inFlight = 0;

/** A call in the current group timed out, so V8 may still be changing the Set. */
let groupTimedOut = false;

/**
 * Wrap a callLiveApi so each write tool call becomes one undo step. Live merges
 * every change into one step until something closes it, so after the last
 * running write call settles, the remote script is asked to close it.
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
    if (!WRITE_TOOLS.has(tool)) {
      return await inner(tool, args, overrides);
    }

    inFlight++;

    let timedOut = false;

    try {
      const result = await inner(tool, args, overrides);

      timedOut = (result as McpResponse).errorCode === "timeout";

      return result;
    } finally {
      if (timedOut) {
        groupTimedOut = true;
      }

      inFlight--;

      if (inFlight === 0) {
        if (!groupTimedOut) {
          sendUndoEnd();
        }

        groupTimedOut = false;
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
