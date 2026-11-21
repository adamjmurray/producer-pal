// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  formatErrorResponse,
  formatSuccessResponse,
} from "#src/shared/mcp-responses.ts";
import { type McpResponse } from "../../max-api-adapter.ts";
import { prepareWidgetFields } from "./clip-ref.ts";
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
export async function handleUiTool(
  args: Record<string, unknown>,
): Promise<McpResponse> {
  const { action, id, ...fields } = args;

  if (action === "list") {
    return formatSuccessResponse({ widgets: listWidgets() });
  }

  if (action === "create") {
    const prepared = await prepareWidgetFields(fields);

    return prepared.ok
      ? answer(createWidget(prepared.fields), "created")
      : formatErrorResponse(prepared.error);
  }

  if (action !== "update" && action !== "remove") {
    return formatErrorResponse(
      `Unknown action "${String(action)}". Use create, update, remove or list`,
    );
  }

  if (typeof id !== "string" || id === "") {
    return formatErrorResponse(`${action} needs the widget's id`);
  }

  if (action === "remove") {
    return answer(removeWidget(id), "removed");
  }

  const prepared = await prepareWidgetFields(fields);

  return prepared.ok
    ? answer(updateWidget(id, prepared.fields), "updated")
    : formatErrorResponse(prepared.error);
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
