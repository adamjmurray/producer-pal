// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  formatErrorResponse,
  formatSuccessResponse,
} from "#src/shared/mcp-responses.ts";
import { type McpResponse } from "../../max-api-adapter.ts";
import {
  createWidget,
  listWidgets,
  removeWidget,
  updateWidget,
  type StoreResult,
} from "./widget-store.ts";

/**
 * Run one ppal-ui call. Node answers it; V8 never sees it.
 * @param args - The validated tool arguments
 * @returns The tool result
 */
export function handleUiTool(args: Record<string, unknown>): McpResponse {
  const { action, id, ...fields } = args;

  if (action === "list") {
    return formatSuccessResponse({ widgets: listWidgets() });
  }

  if (action === "create") {
    return answer(createWidget(fields), "created");
  }

  if (action !== "update" && action !== "remove") {
    return formatErrorResponse(
      `Unknown action "${String(action)}". Use create, update, remove or list`,
    );
  }

  if (typeof id !== "string" || id === "") {
    return formatErrorResponse(`${action} needs the widget's id`);
  }

  return action === "update"
    ? answer(updateWidget(id, fields), "updated")
    : answer(removeWidget(id), "removed");
}

/**
 * @param result - What the store answered
 * @param did - The past-tense verb for the success message
 * @returns The tool result
 */
function answer(result: StoreResult, did: string): McpResponse {
  if (!result.ok) {
    return formatErrorResponse(result.error);
  }

  return formatSuccessResponse({ [did]: result.widget });
}
