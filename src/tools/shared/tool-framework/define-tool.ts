// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodType } from "zod";
import { filterSchemaForSmallModel } from "#src/tools/shared/tool-framework/filter-schema.ts";

// Re-export CallToolResult for use by callers
export type { CallToolResult };

export interface SmallModelModeConfig {
  excludeParams?: string[];
  descriptionOverrides?: Record<string, string>;
  toolDescription?: string;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

export interface ToolOptions {
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema: Record<string, ZodType>;
  smallModelModeConfig?: SmallModelModeConfig;
}

export interface McpOptions {
  smallModelMode?: boolean;
}

type CallLiveApiFunction = (
  name: string,
  data: Record<string, unknown>,
) => Promise<object>;

export interface ToolDefFunction {
  (
    server: McpServer,
    callLiveApi: CallLiveApiFunction,
    mcpOptions?: McpOptions,
  ): void;
  toolName: string;
}

/**
 * Defines an MCP tool with validation and small model mode support
 * @param name - Tool name
 * @param options - Tool configuration options
 * @returns Function that registers the tool with the MCP server
 */
export function defineTool(
  name: string,
  options: ToolOptions,
): ToolDefFunction {
  const fn = (
    server: McpServer,
    callLiveApi: CallLiveApiFunction,
    mcpOptions: McpOptions = {},
  ): void => {
    const { smallModelMode = false } = mcpOptions;
    const { inputSchema, smallModelModeConfig, ...toolConfig } = options;

    // Apply schema filtering for small model mode if configured
    const finalInputSchema =
      smallModelMode && smallModelModeConfig
        ? filterSchemaForSmallModel(
            inputSchema,
            smallModelModeConfig.excludeParams ?? [],
            smallModelModeConfig.descriptionOverrides,
          )
        : inputSchema;

    // Apply tool description override for small model mode if configured
    const finalDescription =
      smallModelMode && smallModelModeConfig?.toolDescription
        ? smallModelModeConfig.toolDescription
        : toolConfig.description;

    // Use loose() so extra args reach our handler (SDK would strip them otherwise)
    const passthroughSchema = z.object(finalInputSchema).loose();

    server.registerTool(
      name,
      {
        ...toolConfig,
        description: finalDescription,
        inputSchema: passthroughSchema,
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        // Detect unexpected arguments before stripping them
        const expectedKeys = new Set(Object.keys(finalInputSchema));
        const extraKeys = Object.keys(args).filter(
          (key) => !expectedKeys.has(key),
        );

        // Parse with strict schema (strips extra keys for callLiveApi)
        const validated = z.object(finalInputSchema).parse(args);

        const result = (await callLiveApi(name, validated)) as CallToolResult;

        // Append warning for extra keys so LLMs learn correct usage
        if (extraKeys.length > 0) {
          const warning = `Warning: ${name} ignored unexpected argument(s): ${extraKeys.join(", ")}`;

          result.content.push({ type: "text", text: warning });
        }

        return result;
      },
    );
  };

  fn.toolName = name;

  return fn;
}
