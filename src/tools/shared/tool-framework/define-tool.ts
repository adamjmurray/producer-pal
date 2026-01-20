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

interface ZodDef {
  type?: string;
  innerType?: ZodType;
}

interface ZodWithDef {
  _def?: ZodDef;
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
        // Coerce args to expected types before validation (transport-layer tolerance)
        const coercedArgs = coerceArgsToSchema(args, finalInputSchema);
        // Create Zod object schema from the input schema object for validation
        const validation = z.object(finalInputSchema).safeParse(coercedArgs);

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

/**
 * Gets the expected primitive type from a Zod schema, unwrapping wrappers.
 * @param zodType - A Zod type definition
 * @returns 'string', 'number', 'boolean', or null for non-primitives
 */
export function getExpectedPrimitiveType(
  zodType: ZodType | null | undefined,
): string | null {
  if (zodType == null) return null;

  // Cast to access internal Zod _def property
  const zodAny = zodType as ZodWithDef;
  const def = zodAny._def;
  const type = def?.type;

  if (type === "string") return "string";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";

  // Unwrap optional, default, nullable, etc.
  const inner = def?.innerType;

  if (inner) return getExpectedPrimitiveType(inner);

  return null;
}

/**
 * Coerces arg values to match schema expected types.
 * Handles: number→string, string→number, string→boolean, number→boolean
 * @param args - The arguments object to coerce
 * @param schema - The Zod schema defining expected types
 * @returns A new object with coerced values
 */
export function coerceArgsToSchema(
  args: Record<string, unknown> | null | undefined,
  schema: Record<string, ZodType>,
): Record<string, unknown> | null | undefined {
  // Return as-is if not a valid object (let Zod handle the error)
  if (args == null || typeof args !== "object") return args;

  const result: Record<string, unknown> = { ...args };

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
