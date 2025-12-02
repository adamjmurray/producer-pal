import { z } from "zod";
import { formatErrorResponse } from "#src/shared/mcp-response-utils.js";
import { filterSchemaForSmallModel } from "./filter-schema.js";

/**
 * Defines an MCP tool with validation and small model mode support
 * @param {string} name - Tool name
 * @param {object} options - Tool configuration options
 * @returns {Function} - Function that registers the tool with the MCP server
 */
export function defineTool(name, options) {
  return (server, callLiveApi, mcpOptions = {}) => {
    const { smallModelMode = false } = mcpOptions;
    const { inputSchema, smallModelModeConfig, ...toolConfig } = options;

    // Apply schema filtering for small model mode if configured
    const finalInputSchema =
      smallModelMode && smallModelModeConfig?.excludeParams
        ? filterSchemaForSmallModel(
            inputSchema,
            smallModelModeConfig.excludeParams,
          )
        : inputSchema;

    server.registerTool(
      name,
      {
        ...toolConfig,
        inputSchema: finalInputSchema,
      },
      async (args) => {
        // Create Zod object schema from the input schema object for validation
        const validation = z.object(finalInputSchema).safeParse(args);

        if (!validation.success) {
          const errorMessages = validation.error.issues.map((issue) => {
            const path =
              issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
            return `${path}${issue.message}`;
          });

          return formatErrorResponse(
            `Validation error in ${name}:\n${errorMessages.join("\n")}`,
          );
        }

        return await callLiveApi(name, validation.data);
      },
    );
  };
}
