// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

import { type Mock } from "vitest";
import { type z, type ZodType } from "zod";

/**
 * The params a tool registered with the MCP server, as authored. defineTool
 * wraps each one for the SDK (see optionalParams), and the wrapper hides the
 * param's description and enum options.
 * @param config - The config passed to server.registerTool
 * @returns The registered params, unwrapped, keyed by name
 */
export function registeredShape(
  config: Record<string, unknown>,
): Record<string, ZodType> {
  const { shape } = config.inputSchema as z.ZodObject;

  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [
      name,
      schema.type === "pipe" ? (schema as z.ZodPipe).out : schema,
    ]),
  );
}

type ToolText = { content: Array<{ type: string; text: string }> };

/**
 * The handler a tool registered on a mock server, called with a fresh abort
 * signal the way the MCP SDK does.
 * @param mockServer - Mock MCP server
 * @param mockServer.registerTool - Its registerTool mock
 * @returns The handler, taking only the args
 */
export function registeredHandler(mockServer: {
  registerTool: Mock;
}): (args: Record<string, unknown>) => Promise<ToolText> {
  const handler = mockServer.registerTool.mock.calls[0]?.[2] as (
    args: Record<string, unknown>,
    extra: { signal: AbortSignal },
  ) => Promise<ToolText>;

  return (args) => handler(args, { signal: new AbortController().signal });
}
