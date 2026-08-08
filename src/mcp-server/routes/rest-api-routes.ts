// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { z } from "zod";
import {
  DISABLED_TOOLS_HEADER,
  resolveEnabledTools,
} from "#src/shared/config.ts";
import { type Notation } from "#src/shared/notation.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { filterSchemaForSmallModel } from "#src/tools/shared/tool-framework/filter-schema.ts";
import {
  resolveModalDescription,
  resolveParamModes,
} from "#src/tools/shared/tool-framework/modal-config.ts";
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
  notation: Notation;
}

/**
 * Register REST API routes on the Express app
 *
 * @param app - Express application
 * @param getConfig - Returns current config (called per-request for live updates)
 * @param buildCallLiveApi - Builds the dispatcher for one request from that
 *   request's toolset. A builder rather than a fixed function because the
 *   ppal-connect enrichment gates skills fragments on the toolset, so a caller
 *   that withholds tools must get the smaller blob.
 */
export function registerRestApiRoutes(
  app: Express,
  getConfig: () => RestApiConfig,
  buildCallLiveApi: (tools: readonly string[]) => CallLiveApiFunction,
): void {
  // Resolve which tool defs are available right now. The raw Live API
  // is opt-in via the device Setup tab; when disabled, it is fully absent
  // (not in the catalog, not callable). When enabled it flows through the
  // same /config tools whitelist as every other tool.
  const getActiveToolDefs = () =>
    getConfig().liveApiEnabled
      ? [...STANDARD_TOOL_DEFS, toolDefLiveApi]
      : [...STANDARD_TOOL_DEFS];

  // Like POST /mcp (see create-express-app.ts), these endpoints are NOT
  // origin-gated the way POST /config is: the chat UI reaches them same-origin
  // from the page URL, which over LAN/tunnel is a non-localhost origin, so a
  // localhost gate would 403 the documented unauthenticated remote-access
  // feature's own requests.
  app.get("/api/tools", (req: Request, res: Response): void => {
    const config = getConfig();
    const enabledSet = new Set(requestTools(req, config));
    // Resolve descriptions and schemas against the active notation, matching how
    // REST tool execution registers them (define-tool.ts). REST is the
    // large-model surface, so small-model mode is off. Without this the catalog
    // served bar|beat `notes` guidance while execution honored config.notation,
    // making a stark/midi-json client send input that fails to parse.
    const context = { notation: config.notation };

    const tools = getActiveToolDefs()
      .filter((td) => enabledSet.has(td.toolName))
      .map((td) => {
        const resolved = resolveParamModes(td.toolOptions.inputSchema, context);
        const finalInputSchema = filterSchemaForSmallModel(
          td.toolOptions.inputSchema,
          resolved.excludeParams,
          resolved.descriptionOverrides,
          resolved.excludeEnumValues,
        );

        return {
          name: td.toolName,
          title: td.toolOptions.title,
          description: resolveModalDescription(
            td.toolOptions.description,
            context,
          ),
          annotations: td.toolOptions.annotations,
          inputSchema: z.toJSONSchema(z.object(finalInputSchema)),
        };
      });

    res.json({ tools });
  });

  app.post(
    "/api/tools/:toolName",
    async (
      req: Request<{ toolName: string }>,
      res: Response,
    ): Promise<void> => {
      const { toolName } = req.params;
      const enabledTools = requestTools(req, getConfig());
      const enabledSet = new Set(enabledTools);

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

        const mcpResponse = (await buildCallLiveApi(enabledTools)(
          toolName,
          parsed.data,
          overrides,
        )) as McpResponse;

        // A tool-call timeout maps to a transport-level error: return HTTP 504
        // instead of a 200 carrying isError. Ordinary tool errors keep their
        // existing 200 + isError contract. The timeout is identified by the
        // structured `errorCode` discriminator set at the timeout origin, not
        // by matching the message text.
        if (mcpResponse.errorCode === "timeout") {
          res.status(504).json({
            error: mcpResponse.content.map((c) => c.text).join("\n"),
            errorCode: "timeout",
          });

          return;
        }

        res.json(unwrapMcpResponse(mcpResponse, formatOverride === "json"));
      } catch (error) {
        console.error(`REST API error calling ${toolName}: ${String(error)}`);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}

/**
 * The toolset for one request: the device's global whitelist minus whatever the
 * caller withheld via the disabled-tools header. Same subtraction semantics as
 * POST /mcp — an absent header means the global whitelist, unchanged — and
 * nothing is reserved, so a caller can withhold ppal-connect itself.
 *
 * It narrows the catalog, 404s a withheld tool, and shrinks the ppal-connect
 * skills blob, which is the point: fragments are gated on the toolset, so a
 * caller that only needs a few tools pays for only those fragments.
 *
 * @param req - Express request
 * @param config - Current device config
 * @returns The tool names available to this request
 */
function requestTools(req: Request, config: RestApiConfig): string[] {
  return resolveEnabledTools(req.get(DISABLED_TOOLS_HEADER), config.tools);
}

/**
 * Parse the ?format query param into a normalized value.
 *
 * The REST API defaults to `json` when the param is omitted: this endpoint is
 * an HTTP integration surface, so structured JSON is the right default. The
 * compact JS-literal format (optimized for LLM context) is opt-in via
 * `?format=compact`.
 *
 * @param raw - Raw query value from Express
 * @returns "json" (the default when absent) | "compact" when valid,
 *   "invalid" when present but not recognized
 */
function parseFormatQuery(raw: unknown): "json" | "compact" | "invalid" {
  if (raw === undefined) return "json";
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
 * @param format - Result of parseFormatQuery (always resolved to a concrete
 *   format; the REST default is `json`)
 * @param timeoutMs - Result of parseTimeoutQuery
 * @returns RequestOverrides with compactOutput always set, plus timeoutMs when
 *   provided
 */
function buildOverrides(
  format: "json" | "compact",
  timeoutMs: number | undefined,
): RequestOverrides {
  const overrides: RequestOverrides = {
    compactOutput: format === "compact",
  };

  if (timeoutMs !== undefined) {
    overrides.timeoutMs = timeoutMs;
  }

  return overrides;
}

interface UnwrappedResponse {
  result: unknown;
  isError: boolean;
  warnings?: string[];
  appended?: string[];
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
 * Items past the first prefixed with `WARNING: ` become warnings; any other
 * extra items are Node-appended text blocks (the ppal-connect skills blob plus
 * the self-labeling project-context, global-context, and memory-index blocks
 * pushed by `withConnectAppend`) and are surfaced as an `appended` string array
 * rather than dropped. If the
 * first item is not valid JSON (a V8 contract regression), it falls back to
 * returning the raw text.
 *
 * @param mcpResponse - Response from callLiveApi
 * @param parseJson - True when the caller asked for `?format=json`
 * @returns Plain object with `result`, `isError`, and optional `warnings` /
 *   `appended`
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
  // `WARNING: ` are warnings emitted by the V8 layer; the remaining extra
  // items are Node-appended blocks (ppal-connect skills, project context,
  // global context, and memory index) and are surfaced under `appended` rather
  // than dropped.
  const [resultText = "", ...rest] = items;
  const warnings: string[] = [];
  const appended: string[] = [];

  for (const line of rest) {
    if (line.startsWith(WARNING_PREFIX)) {
      warnings.push(line.slice(WARNING_PREFIX.length));
    } else {
      appended.push(line);
    }
  }

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
  if (appended.length > 0) response.appended = appended;

  return response;
}
