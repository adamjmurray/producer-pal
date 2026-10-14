// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
