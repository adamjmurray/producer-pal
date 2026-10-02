// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import {
  createTestDevice,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResultWithWarnings,
  sleep,
} from "../../mcp-test-helpers";

export interface UpdateDeviceParamResult {
  params?: {
    id?: string;
    name: string;
    value?: number | string;
    ok?: boolean;
    detail?: string;
  }[];
}

/** What one param write answered with. */
export interface WrittenParam {
  data: UpdateDeviceParamResult;
  warnings: string[];
  /** The error, when the call failed */
  error?: string;
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
 * @returns The parsed result and its warnings, or the error
 */
export async function writeParam(
  client: Client,
  deviceId: string,
  name: string,
  value: string,
): Promise<WrittenParam> {
  const result = await client.callTool({
    name: "ppal-update-device",
    arguments: { id: deviceId, params: [{ name, value }] },
  });

  await sleep(100);

  if (isToolError(result)) {
    return {
      data: {},
      warnings: getToolWarnings(result),
      error: getToolErrorMessage(result),
    };
  }

  return parseToolResultWithWarnings<UpdateDeviceParamResult>(result);
}

/**
 * Assert one param was refused, and no warning raised. It was all the call
 * asked, so the call fails with the reason.
 * @param result - What writeParam returned
 * @param name - The param name as the call spelled it
 * @param reason - Substring the reason must contain
 */
export function expectParamRefused(
  result: WrittenParam,
  name: string,
  reason: string,
): void {
  expect(result.error).toContain(`no param landed — "${name}": `);
  expect(result.error).toContain(reason);
  expect(result.warnings).toStrictEqual([]);
}
