// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodType } from "zod";
import { type Notation } from "#src/shared/notation.ts";
import { filterSchemaForSmallModel } from "#src/tools/shared/tool-framework/filter-schema.ts";

// Re-export CallToolResult for use by callers
export type { CallToolResult };

export interface SmallModelModeConfig {
  excludeParams?: string[];
  excludeEnumValues?: Record<string, string[]>;
  descriptionOverrides?: Record<string, string>;
  toolDescription?: string;
}

/** Per-notation description overrides (see {@link NotationConfig}). */
export interface NotationOverride {
  descriptionOverrides?: Record<string, string>;
  toolDescription?: string;
}

/**
 * Notation-keyed description overrides, applied when the active notation
 * (`config.notation`) matches a key. Use this for params whose text describes
 * the note-content format — chiefly `notes` — so the tool schema reflects the
 * notation actually in effect (e.g. midi-json / stark / abstark) instead of
 * hardcoding bar|beat. Notation is authoritative for these params: its override
 * is applied AFTER {@link SmallModelModeConfig} so it wins over the small-model
 * text. `barbeat` (the default) has no key and falls through to the base
 * `.describe()`.
 */
export type NotationConfig = Partial<Record<Notation, NotationOverride>>;

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
  notationConfig?: NotationConfig;
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
    const { smallModelMode = false, notation } = mcpOptions;
    const { inputSchema, smallModelModeConfig, notationConfig, ...toolConfig } =
      options;

    // Two independent override layers combine here:
    // - small-model mode trims params (excludeParams) and can override text
    // - the active notation overrides note-format text (chiefly `notes`)
    // Notation is applied AFTER small-model so it wins for those params — the
    // notation in effect is authoritative for how notes are written.
    const smallModel = smallModelMode ? smallModelModeConfig : undefined;
    const notationOverride =
      notation != null ? notationConfig?.[notation] : undefined;

    const descriptionOverrides = {
      ...smallModel?.descriptionOverrides,
      ...notationOverride?.descriptionOverrides,
    };

    // filterSchemaForSmallModel returns the schema unchanged when there is
    // nothing to exclude or override, so calling it unconditionally is a no-op
    // for tools/contexts without either config.
    const finalInputSchema = filterSchemaForSmallModel(
      inputSchema,
      smallModel?.excludeParams ?? [],
      descriptionOverrides,
      smallModel?.excludeEnumValues,
    );

    const finalDescription =
      notationOverride?.toolDescription ??
      smallModel?.toolDescription ??
      toolConfig.description;

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

        // In small model mode, filter out excluded enum values as defense-in-depth
        // (schema validation is primary gate, this catches hallucinated values)
        const finalArgs =
          smallModelMode && smallModelModeConfig?.excludeEnumValues
            ? filterExcludedEnumValues(
                validated,
                smallModelModeConfig.excludeEnumValues,
              )
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
