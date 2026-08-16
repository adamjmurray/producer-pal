// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";
import {
  type DeprecatedParamInfo,
  deprecatedParamWarning,
} from "#src/tools/shared/tool-framework/deprecated-param.ts";
import {
  type ModalDescription,
  resolveModalDescription,
} from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// Re-export CallToolResult for use by callers
export type { CallToolResult };

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

export interface ToolOptions {
  title?: string;
  // A plain string, or a modal description with per-mode (notation / small-model)
  // overrides. See modal-config.ts.
  description: ModalDescription;
  annotations?: ToolAnnotations;
  // Param descriptions/exclusions/enum-trims are co-located on each param via
  // param() (see modal-config.ts) — there is no separate override config.
  inputSchema: Record<string, ZodType>;
}

export interface McpOptions {
  smallModelMode?: boolean;
  notation?: Notation;
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
  toolOptions: ToolOptions;
}

/**
 * Defines an MCP tool with validation and modal (notation / small-model) support
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
    const { smallModelMode = false, notation } = mcpOptions;
    const { inputSchema, description, ...toolConfig } = options;

    // Deprecated params still validate, but are not published — the model never
    // learns the old name while callers that still send it keep working.
    const {
      validating: finalInputSchema,
      published: publishedSchema,
      deprecated: deprecatedParams,
      excludeEnumValues,
    } = resolveToolSchema(inputSchema, { notation, smallModelMode });

    const finalDescription = resolveModalDescription(description, {
      notation,
      smallModelMode,
    });

    // Use loose() so extra args reach our handler (SDK would strip them otherwise)
    const passthroughSchema = z.object(publishedSchema).loose();

    server.registerTool(
      name,
      {
        ...toolConfig,
        description: finalDescription,
        inputSchema: passthroughSchema,
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        // Detect unexpected arguments before stripping them. Deprecated params
        // are expected here even though they were not published.
        const expectedKeys = new Set(Object.keys(finalInputSchema));
        const extraKeys = Object.keys(args).filter(
          (key) => !expectedKeys.has(key),
        );
        const usedDeprecated = Object.keys(deprecatedParams).filter(
          (key) => args[key] != null,
        );

        // Parse with strict schema (strips extra keys for callLiveApi)
        const validated = z.object(finalInputSchema).parse(args);

        // Filter out excluded enum values as defense-in-depth (schema validation
        // is the primary gate; this catches hallucinated values). Populated only
        // when a mode trims a param's enum values.
        const finalArgs =
          Object.keys(excludeEnumValues).length > 0
            ? filterExcludedEnumValues(validated, excludeEnumValues)
            : validated;

        const rawResult = (await callLiveApi(
          name,
          finalArgs,
        )) as CallToolResult & {
          errorCode?: unknown;
        };

        // Strip the internal `errorCode` discriminator (used by the REST route
        // to map timeouts to HTTP 504) so it never reaches the MCP SDK wire
        // result — the MCP/JSON-RPC contract is unchanged (errors ride as
        // isError in the result body).
        const { errorCode: _errorCode, ...result } = rawResult;

        // Append warning for extra keys so LLMs learn correct usage
        if (extraKeys.length > 0) {
          const warning = `Warning: ${name} ignored unexpected argument(s): ${extraKeys.join(", ")}`;

          result.content.push({ type: "text", text: warning });
        }

        // The value was honored; this only steers the caller to the new name.
        for (const key of usedDeprecated) {
          result.content.push({
            type: "text",
            text: deprecatedParamWarning(
              name,
              key,
              deprecatedParams[key] as DeprecatedParamInfo,
            ),
          });
        }

        return result;
      },
    );
  };

  fn.toolName = name;
  fn.toolOptions = options;

  return fn;
}

/**
 * Filter excluded enum values from validated args before sending to V8 layer
 * @param validated - Zod-validated args
 * @param excludeEnumValues - Map of param names to values to remove
 * @returns Args with excluded values filtered from array params
 */
export function filterExcludedEnumValues(
  validated: Record<string, unknown>,
  excludeEnumValues: Record<string, string[]>,
): Record<string, unknown> {
  const result = { ...validated };

  for (const [paramName, valuesToExclude] of Object.entries(
    excludeEnumValues,
  )) {
    const value = result[paramName];

    if (Array.isArray(value)) {
      result[paramName] = value.filter(
        (v: unknown) => !valuesToExclude.includes(v as string),
      );
    }
  }

  return result;
}
