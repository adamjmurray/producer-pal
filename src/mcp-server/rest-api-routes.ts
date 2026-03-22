// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  STANDARD_TOOL_DEFS,
  type CallLiveApiFunction,
} from "./create-mcp-server.ts";
import * as console from "./node-for-max-logger.ts";

interface RestApiConfig {
  tools: string[];
}

interface McpResponseContent {
  type: string;
  text: string;
}

interface McpResponse {
  content: McpResponseContent[];
  isError?: boolean;
}

/**
 * Register REST API routes on the Express app
 *
 * @param app - Express application
 * @param getConfig - Returns current config (called per-request for live updates)
 * @param callLiveApi - Function to dispatch tool calls to Max V8
 */
export function registerRestApiRoutes(
  app: Express,
  getConfig: () => RestApiConfig,
  callLiveApi: CallLiveApiFunction,
): void {
  app.get("/api/tools", (_req: Request, res: Response): void => {
    const enabledSet = new Set(getConfig().tools);

    const tools = STANDARD_TOOL_DEFS.filter((td) =>
      enabledSet.has(td.toolName),
    ).map((td) => ({
      name: td.toolName,
      title: td.toolOptions.title,
      description: td.toolOptions.description,
      annotations: td.toolOptions.annotations,
      inputSchema: z.toJSONSchema(z.object(td.toolOptions.inputSchema)),
    }));

    res.json({ tools });
  });

  app.post(
    "/api/tools/:toolName",
    async (
      req: Request<{ toolName: string }>,
      res: Response,
    ): Promise<void> => {
      const { toolName } = req.params;
      const enabledSet = new Set(getConfig().tools);

      const toolDef = STANDARD_TOOL_DEFS.find((td) => td.toolName === toolName);

      if (!toolDef || !enabledSet.has(toolName)) {
        res
          .status(404)
          .json({ error: `Unknown or disabled tool: ${toolName}` });

        return;
      }

      const schema = z.object(toolDef.toolOptions.inputSchema);
      const parsed = schema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });

        return;
      }

      try {
        const mcpResponse = (await callLiveApi(
          toolName,
          parsed.data,
        )) as McpResponse;

        res.json(unwrapMcpResponse(mcpResponse));
      } catch (error) {
        console.error(`REST API error calling ${toolName}: ${String(error)}`);
        res
          .status(500)
          .json({ error: `Internal server error: ${errorMessage(error)}` });
      }
    },
  );
}

/**
 * Unwrap MCP response format into plain REST response
 *
 * @param mcpResponse - Response from callLiveApi
 * @returns Plain object with result text and isError flag
 */
function unwrapMcpResponse(mcpResponse: McpResponse): {
  result: string;
  isError: boolean;
} {
  const text = mcpResponse.content.map((c) => c.text).join("\n");

  return { result: text, isError: mcpResponse.isError ?? false };
}
