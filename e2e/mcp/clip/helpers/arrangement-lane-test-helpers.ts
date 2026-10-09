// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading a track's arrangement automation lane in e2e suites. The lane can't
 * be read directly, so these move the playhead (transport stopped,
 * Song.back_to_arranger off) and read the parameter on a LATER call: its value
 * follows the lane on Live's next update tick, about 100 ms.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult, sleep } from "../../mcp-test-helpers.ts";
import { callTool } from "./arrangement-clip-query-test-helpers.ts";

interface LiveApiResult {
  results: unknown[];
}

/**
 * Run operations on a Live object through ppal-live-api.
 * @param client - Connected MCP client
 * @param path - The object's Live API path
 * @param operations - The operations to run
 * @returns The operations' results
 */
export async function liveApi(
  client: Client,
  path: string,
  operations: unknown[],
): Promise<LiveApiResult> {
  return parseToolResult<LiveApiResult>(
    await callTool(client, "ppal-live-api", { path, operations }),
  );
}

/**
 * Read a track's pan at a song time: set the time, wait, then read.
 * @param client - Connected MCP client
 * @param trackIndex - The track
 * @param songBeats - The song time, in beats; not past the Set's length
 * @returns The pan the lane gives there
 */
export async function laneAt(
  client: Client,
  trackIndex: number,
  songBeats: number,
): Promise<number> {
  await liveApi(client, "live_set", [
    { type: "set-property", property: "back_to_arranger", value: 0 },
    { type: "set-property", property: "current_song_time", value: songBeats },
  ]);
  await sleep(250);

  const read = await liveApi(
    client,
    `live_set tracks ${String(trackIndex)} mixer_device panning`,
    [{ type: "get-property", property: "value" }],
  );

  return read.results[0] as number;
}
