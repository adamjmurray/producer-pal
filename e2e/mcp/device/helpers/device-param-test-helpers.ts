// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import { parseToolResult } from "../../mcp-test-helpers.ts";

export interface ParamInfo {
  name: string;
  value?: number | string;
  min?: number;
  max?: number;
  options?: string[];
  alsoAccepts?: string;
}

/**
 * Read one parameter off a device by name.
 * @param client - Connected MCP client
 * @param deviceId - Device to read
 * @param name - Parameter name
 * @returns The parameter as ppal-read-device reports it
 */
export async function readParam(
  client: Client,
  deviceId: string,
  name: string,
): Promise<ParamInfo> {
  const device = parseToolResult<{ parameters?: ParamInfo[] }>(
    await client.callTool({
      name: "ppal-read-device",
      arguments: {
        id: deviceId,
        include: ["params", "param-values"],
        paramSearch: name,
      },
    }),
  );
  const found = (device.parameters ?? []).find((param) => param.name === name);

  expect(found, `no parameter named "${name}"`).toBeDefined();

  return found as ParamInfo;
}
