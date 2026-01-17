import { z } from "zod";
import { formatErrorResponse } from "#src/shared/mcp-response-utils.js";
import { filterSchemaForSmallModel } from "./filter-schema.js";

/**
 * Gets the expected primitive type from a Zod schema, unwrapping wrappers.
 * @param {object} zodType - A Zod type definition
 * @returns {string|null} 'string', 'number', 'boolean', or null for non-primitives
 */
export function getExpectedPrimitiveType(zodType) {
  const type = zodType?._def?.type;

  if (type === "string") return "string";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";

  // Unwrap optional, default, nullable, etc.
  const inner = zodType?._def?.innerType;

  if (inner) return getExpectedPrimitiveType(inner);

  return null;
}

/**
 * Coerces arg values to match schema expected types.
 * Handles: number→string, string→number, string→boolean, number→boolean
 * @param {object} args - The arguments object to coerce
 * @param {object} schema - The Zod schema defining expected types
 * @returns {object} A new object with coerced values
 */
export function coerceArgsToSchema(args, schema) {
  // Return as-is if not a valid object (let Zod handle the error)
  if (args == null || typeof args !== "object") return args;

  const result = { ...args };

  for (const [key, zodType] of Object.entries(schema)) {
    if (!(key in result) || result[key] == null) continue;

    const value = result[key];
    const expectedType = getExpectedPrimitiveType(zodType);

    if (expectedType === "string" && typeof value === "number") {
      result[key] = String(value);
    } else if (expectedType === "number" && typeof value === "string") {
      const parsed = Number(value);

      if (!Number.isNaN(parsed)) result[key] = parsed;
    } else if (expectedType === "boolean" && typeof value === "string") {
      const lower = value.toLowerCase();

      if (lower === "true") result[key] = true;
      else if (lower === "false") result[key] = false;
    } else if (expectedType === "boolean" && typeof value === "number") {
      result[key] = value !== 0;
    }
  }

  return result;
}

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
      smallModelMode && smallModelModeConfig
        ? filterSchemaForSmallModel(
            inputSchema,
            smallModelModeConfig.excludeParams,
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
      async (args) => {
        // Coerce args to expected types before validation (transport-layer tolerance)
        const coercedArgs = coerceArgsToSchema(args, finalInputSchema);
        // Create Zod object schema from the input schema object for validation
        const validation = z.object(finalInputSchema).safeParse(coercedArgs);

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
