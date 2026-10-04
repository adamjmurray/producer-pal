// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Calling the remote script's envelope routes directly, for e2e suites. */

import { remoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  callToolAndSettle,
  parseToolResult,
  sleep,
} from "../../mcp-test-helpers.ts";

/**
 * Post to one envelope route of the remote script.
 * @param route - The route name: list, read, write or clear
 * @param body - The request body
 * @returns The HTTP status and the JSON the route answered with
 */
export async function postEnvelopeRoute(
  route: "list" | "read" | "write" | "clear",
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(
    `http://127.0.0.1:${String(remoteScriptPort())}/envelope/${route}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const answer = (await response.json()) as Record<string, unknown>;

  await sleep(100);

  return { status: response.status, body: answer };
}

/**
 * Call a tool, let Live settle, and parse its result.
 * @param client - Connected MCP client
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The parsed result
 */
export async function settledTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  return parseToolResult<T>(await callToolAndSettle(client, name, args));
}
