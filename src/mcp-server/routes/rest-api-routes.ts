// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  STANDARD_TOOL_DEFS,
  type CallLiveApiFunction,
} from "../create-mcp-server.ts";
import {
  MAX_TIMEOUT_MS,
  type McpResponse,
  type RequestOverrides,
} from "../max-api-adapter.ts";
import * as console from "../node-for-max-logger.ts";

interface RestApiConfig {
  tools: string[];
  liveApiEnabled: boolean;
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
  // Resolve which tool defs are available right now. The raw Live API
  // is opt-in via the device Setup tab; when disabled, it is fully absent
  // (not in the catalog, not callable). When enabled it flows through the
  // same /config tools whitelist as every other tool.
  const getActiveToolDefs = () =>
    getConfig().liveApiEnabled
      ? [...STANDARD_TOOL_DEFS, toolDefLiveApi]
      : [...STANDARD_TOOL_DEFS];

  app.get("/api/tools", (_req: Request, res: Response): void => {
    const enabledSet = new Set(getConfig().tools);

    const tools = getActiveToolDefs()
      .filter((td) => enabledSet.has(td.toolName))
      .map((td) => ({
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

      const toolDef = getActiveToolDefs().find(
        (td) => td.toolName === toolName,
      );

      if (!toolDef || !enabledSet.has(toolName)) {
        res
          .status(404)
          .json({ error: `Unknown or disabled tool: ${toolName}` });

        return;
      }

      const formatOverride = parseFormatQuery(req.query.format);

      if (formatOverride === "invalid") {
        res.status(400).json({
          error: "Invalid format query param. Use 'json' or 'compact'.",
        });

        return;
      }

      const timeoutOverride = parseTimeoutQuery(req.query.timeoutMs);

      if (timeoutOverride === "invalid") {
        res.status(400).json({
          error: `Invalid timeoutMs query param. Use a positive integer up to ${MAX_TIMEOUT_MS}.`,
        });

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
        const overrides = buildOverrides(formatOverride, timeoutOverride);

        const mcpResponse = (await callLiveApi(
          toolName,
          parsed.data,
          overrides,
        )) as McpResponse;

        res.json(unwrapMcpResponse(mcpResponse, formatOverride === "json"));
      } catch (error) {
        console.error(`REST API error calling ${toolName}: ${String(error)}`);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}

/**
 * Parse the ?format query param into a normalized value.
 *
 * @param raw - Raw query value from Express
 * @returns "json" | "compact" when valid, undefined when absent,
 *   "invalid" when present but not recognized
 */
function parseFormatQuery(
  raw: unknown,
): "json" | "compact" | "invalid" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "json") return "json";
  if (raw === "compact") return "compact";

  return "invalid";
}

/**
 * Parse the ?timeoutMs query param into a normalized value.
 *
 * @param raw - Raw query value from Express
 * @returns Numeric ms when valid, undefined when absent, "invalid" when
 *   present but not a positive integer in (0, MAX_TIMEOUT_MS]
 */
function parseTimeoutQuery(raw: unknown): number | "invalid" | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return "invalid";

  const n = Number(raw);

  if (!Number.isInteger(n) || n <= 0 || n > MAX_TIMEOUT_MS) {
    return "invalid";
  }

  return n;
}

/**
 * Build the RequestOverrides object from parsed query params, or undefined
 * when no overrides were supplied.
 *
 * @param format - Result of parseFormatQuery
 * @param timeoutMs - Result of parseTimeoutQuery
 * @returns RequestOverrides or undefined when no overrides apply
 */
function buildOverrides(
  format: "json" | "compact" | undefined,
  timeoutMs: number | undefined,
): RequestOverrides | undefined {
  const overrides: RequestOverrides = {};

  if (format !== undefined) {
    overrides.compactOutput = format === "compact";
  }

  if (timeoutMs !== undefined) {
    overrides.timeoutMs = timeoutMs;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

interface UnwrappedResponse {
  result: unknown;
  isError: boolean;
  warnings?: string[];
}

const WARNING_PREFIX = "WARNING: ";

/**
 * Unwrap MCP response format into a plain REST response.
 *
 * Default mode (parseJson=false): joins all content text into one string,
 * preserving the legacy contract where warnings appear inline as
 * `WARNING: ...` lines after the data.
 *
 * JSON mode (parseJson=true, set by `?format=json`): parses the first
 * content item as JSON and exposes warnings as a separate string array.
 * Items past the first are filtered by the `WARNING: ` prefix so non-warning
 * content the V8 layer might emit in the future is not silently treated as a
 * warning. If the first item is not valid JSON (a V8 contract regression), it
 * falls back to returning the raw text.
 *
 * @param mcpResponse - Response from callLiveApi
 * @param parseJson - True when the caller asked for `?format=json`
 * @returns Plain object with `result`, `isError`, and optional `warnings`
 */
function unwrapMcpResponse(
  mcpResponse: McpResponse,
  parseJson: boolean,
): UnwrappedResponse {
  const isError = mcpResponse.isError ?? false;
  const items = mcpResponse.content.map((c) => c.text);

  if (!parseJson || isError) {
    return { result: items.join("\n"), isError };
  }

  // First content item is the tool result. Subsequent items prefixed with
  // `WARNING: ` are warnings emitted by the V8 layer; anything else past the
  // first item is unexpected under the current contract and ignored.
  const [resultText = "", ...rest] = items;
  const warnings = rest
    .filter((line) => line.startsWith(WARNING_PREFIX))
    .map((line) => line.slice(WARNING_PREFIX.length));

  let result: unknown;

  try {
    result = JSON.parse(resultText);
  } catch {
    // V8 should always emit valid JSON when compactOutput is false, but be
    // defensive: surface the raw text instead of letting the route blackhole
    // into a generic 500.
    result = resultText;
  }

  const response: UnwrappedResponse = { result, isError: false };

  if (warnings.length > 0) response.warnings = warnings;

  return response;
}
