// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { GEN_UI_TOOL_ID } from "#src/shared/gen-ui-types.ts";
import { type WrappedCallLiveApi } from "../../helpers/connect/connect-append.ts";
import { type McpResponse } from "../../max-api-adapter.ts";
import { nodeWarn } from "../../node-for-max-logger.ts";
import { isWriteCall } from "../write-queue/write-calls.ts";
import { publish } from "./gen-ui-hub.ts";
import { touchedRefs } from "./touched-refs.ts";
import { handleUiTool } from "./ui-tool.ts";

/**
 * Wrap a callLiveApi for the generative UI, on MCP and REST alike. Wrap it
 * outermost, so a ppal-ui call is answered here and never queued for V8.
 *
 * After a write call that can change the Set, tell the viewers which Live
 * objects it touched so they re-read their clips. Telling them is best effort:
 * it runs after the call settled, and whatever goes wrong there is logged and
 * dropped. The result goes back exactly as it came.
 *
 * Live edits made by hand are not seen. That takes Live listeners.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that serves ppal-ui and announces writes
 */
export function withGenUi(inner: WrappedCallLiveApi): WrappedCallLiveApi {
  return async (tool, args, overrides) => {
    if (tool === GEN_UI_TOOL_ID) {
      return await handleUiTool(args as Record<string, unknown>);
    }

    // A throw skips the announcement: no result says what changed.
    const result = await inner(tool, args, overrides);

    announceWrite(tool, args, result);

    return result;
  };
}

/**
 * @param tool - The tool that ran
 * @param args - Its arguments
 * @param result - Its result
 */
function announceWrite(tool: string, args: object, result: McpResponse): void {
  try {
    if (isWriteCall(tool, args)) {
      publish({ type: "live", ...touchedRefs(tool, args, result) });
    }
  } catch (error) {
    nodeWarn(`Could not announce ${tool} to the UI: ${errorMessage(error)}`);
  }
}
