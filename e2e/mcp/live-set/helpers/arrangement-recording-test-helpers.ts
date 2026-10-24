// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { sleep } from "../../mcp-test-helpers.ts";
import { callTool } from "../../clip/helpers/arrangement-clip-query-test-helpers.ts";

/**
 * Run operations on a Live object through ppal-live-api.
 * @param client - Connected MCP client
 * @param path - Live path of the object
 * @param operations - Operations to run, in order
 */
export async function liveApi(
  client: Client,
  path: string,
  operations: unknown[],
): Promise<void> {
  await callTool(client, "ppal-live-api", { path, operations });
}

/**
 * Set a property on a Live object.
 * @param client - Connected MCP client
 * @param path - Live path of the object
 * @param property - Property name
 * @param value - New value
 */
export async function setProperty(
  client: Client,
  path: string,
  property: string,
  value: number,
): Promise<void> {
  await liveApi(client, path, [{ type: "set-property", property, value }]);
}

/**
 * Record arrangement lanes. With record mode on and the transport running,
 * changing a parameter through the API writes a lane, but only in real time,
 * hence the sleeps. Nothing else may record, so the armed track is disarmed.
 * @param client - Connected MCP client
 * @param change - Changes the parameters to get a lane; called twice, a second
 *   apart, with false and then true
 */
export async function recordArrangementLanes(
  client: Client,
  change: (second: boolean) => Promise<void>,
): Promise<void> {
  await setProperty(client, "live_set tracks 10", "arm", 0);
  await setProperty(client, "live_set", "record_mode", 1);
  await liveApi(client, "live_set", [
    { type: "call", method: "start_playing" },
  ]);
  await sleep(1000);
  await change(false);
  await sleep(1000);
  await change(true);
  await sleep(500);
  await setProperty(client, "live_set", "record_mode", 0);
  await liveApi(client, "live_set", [{ type: "call", method: "stop_playing" }]);
  await sleep(500);
}
