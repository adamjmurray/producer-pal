import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodType } from "zod";
import { formatErrorResponse } from "#src/shared/mcp-response-utils.ts";
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

/**
 * Defines an MCP tool with validation and small model mode support
 * @param name - Tool name
 * @param options - Tool configuration options
 * @returns Function that registers the tool with the MCP server
 */
export function defineTool(
  name: string,
  options: ToolOptions,
): (
  server: McpServer,
  callLiveApi: CallLiveApiFunction,
  mcpOptions?: McpOptions,
) => void {
  return (server, callLiveApi, mcpOptions = {}) => {
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

    server.registerTool(
      name,
      {
        ...toolConfig,
        description: finalDescription,
        inputSchema: finalInputSchema,
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        // Create Zod object schema from the input schema object for validation
        const validation = z.object(finalInputSchema).safeParse(args);

        if (!validation.success) {
          const errorMessages = validation.error.issues.map(
            (issue: { path: PropertyKey[]; message: string }) => {
              const path =
                issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";

              return `${path}${issue.message}`;
            },
          );

          return formatErrorResponse(
            `Validation error in ${name}:\n${errorMessages.join("\n")}`,
          ) as CallToolResult;
        }

        return (await callLiveApi(name, validation.data)) as CallToolResult;
      },
    );
  };
}
