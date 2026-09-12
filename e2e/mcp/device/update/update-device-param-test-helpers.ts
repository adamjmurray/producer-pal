// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createTestDevice,
  parseToolResultWithWarnings,
  sleep,
} from "../../mcp-test-helpers";

export interface UpdateDeviceParamResult {
  params?: {
    id?: string;
    name: string;
    value?: number | string;
    reason?: string;
  }[];
}

/**
 * Create a Glue Compressor on the first track.
 * @param client - MCP client
 * @returns The new device's id
 */
export function createGlueCompressor(client: Client): Promise<string> {
  return createTestDevice(client, "Glue Compressor", "t0");
}

/**
 * Write one param value and return the result with any warnings it raised.
 * @param client - MCP client
 * @param deviceId - Device holding the parameter
 * @param name - Parameter to write
 * @param value - Value to request, unit and all
 * @returns The parsed result and its warnings
 */
export async function writeParam(
  client: Client,
  deviceId: string,
  name: string,
  value: string,
): Promise<{ data: UpdateDeviceParamResult; warnings: string[] }> {
  const result = parseToolResultWithWarnings<UpdateDeviceParamResult>(
    await client.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, params: [{ name, value }] },
    }),
  );

  await sleep(100);

  return result;
}
