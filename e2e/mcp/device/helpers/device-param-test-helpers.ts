// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
} from "../../mcp-test-helpers.ts";

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

/** One `params` entry, as create-device and update-device report it. */
export interface ParamResultEntry {
  id?: string;
  name: string;
  value?: unknown;
  /** False only on a param nothing was written to */
  ok?: boolean;
  reason?: string;
}

/**
 * Send one device-tool call and read back the `params` it reports.
 * @param client - Connected MCP client
 * @param tool - The tool to call (ppal-update-device or ppal-create-device)
 * @param args - The tool arguments
 * @returns One entry per param sent, and the warnings the call raised
 */
export async function callForParams(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ entries: ParamResultEntry[]; warnings: string[] }> {
  const { data, warnings } = parseToolResultWithWarnings<{
    params?: ParamResultEntry[];
  }>(await client.callTool({ name: tool, arguments: args }));

  return { entries: data.params ?? [], warnings };
}

/**
 * Assert a two-param write answered with one entry each: the name that reached
 * nothing as a skip, the one that landed with the value it reads as, and no
 * warning.
 * @param result - What callForParams returned
 * @param missing - The name that was to reach nothing
 * @param landed - The param that was written, and the value it should read as
 */
export function expectSkipThenValue(
  result: { entries: ParamResultEntry[]; warnings: string[] },
  missing: string,
  landed: { name: string; value: unknown },
): void {
  expect(result.entries).toStrictEqual([
    {
      name: missing,
      ok: false,
      reason: expect.stringContaining("not found on"),
    },
    { id: expect.any(String), ...landed },
  ]);
  expect(result.warnings).toStrictEqual([]);
}
