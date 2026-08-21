// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Express, type Request, type Response } from "express";
import { z, type ZodType } from "zod";
import { MAX_TIMEOUT_MS } from "#src/shared/config.ts";
import { WARNING_PREFIX } from "#src/shared/mcp-response-utils.ts";
import { type Notation } from "#src/shared/notation.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  collectHiddenParams,
  hiddenParamWarnings,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { resolveModalDescription } from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { unsetEmptyParams } from "#src/tools/shared/tool-framework/unset-empty-params.ts";
import {
  STANDARD_TOOL_DEFS,
  type CallLiveApiFunction,
} from "../create-mcp-server.ts";
import {
  resolveRequestProfile,
  type RequestProfile,
} from "../helpers/http/request-profile.ts";
import { type McpResponse, type RequestOverrides } from "../max-api-adapter.ts";
import * as console from "../node-for-max-logger.ts";

interface RestApiConfig {
  tools: string[];
  liveApiEnabled: boolean;
  notation: Notation;
  smallModelMode: boolean;
}

/**
 * Register REST API routes on the Express app
 *
 * Both endpoints resolve the same three per-request headers POST /mcp reads
 * (see resolveRequestProfile) — the toolset, the notation, and small-model mode
 * — so a REST caller can run its own profile without a POST /config changing
 * every other connected client's.
 *
 * @param app - Express application
 * @param getConfig - Returns current config (called per-request for live updates)
 * @param buildCallLiveApi - Builds the dispatcher for one request from that
 *   request's profile. A builder rather than a fixed function because the
 *   ppal-connect enrichment gates skills fragments on the toolset and keys the
 *   skills variant on notation and small-model mode, and because notation rides
 *   down to V8 as a request override.
 */
export function registerRestApiRoutes(
  app: Express,
  getConfig: () => RestApiConfig,
  buildCallLiveApi: (profile: RequestProfile) => CallLiveApiFunction,
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
    const profile = resolveRequestProfile(req, getConfig());
    const enabledSet = new Set(profile.tools);
    // Resolve descriptions and schemas against this request's notation and mode,
    // the same way define-tool.ts registers them for MCP. Without this the
    // catalog served bar|beat `notes` guidance while execution honored the
    // caller's notation, making a stark/midi-json client send input that fails
    // to parse.
    const context = {
      notation: profile.notation,
      smallModelMode: profile.smallModelMode,
    };

    const tools = getActiveToolDefs()
      .filter((td) => enabledSet.has(td.toolName))
      .map((td) => {
        // Same resolution define-tool.ts registers with, deprecation filter
        // included, so the REST catalog can't advertise a param MCP hides.
        const { published } = resolveToolSchema(
          td.toolOptions.inputSchema,
          context,
        );

        return {
          name: td.toolName,
          title: td.toolOptions.title,
          description: resolveModalDescription(
            td.toolOptions.description,
            context,
          ),
          annotations: td.toolOptions.annotations,
          inputSchema: z.toJSONSchema(z.object(published)),
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
      const profile = resolveRequestProfile(req, getConfig());
      const enabledSet = new Set(profile.tools);

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

      // Validate against the FULL schema, not the small-model-filtered one the
      // catalog advertises. Deliberately looser than MCP, which validates
      // against the filtered schema — don't "fix" the asymmetry. Filtering
      // drops params AND narrows enums, so matching MCP here would start
      // rejecting calls that work today whenever the device's small-model mode
      // is on: `ppal-read-clip` with `include: ["warp"]`, `ppal-context` with
      // `action: "delete"`, and so on. Every filtered value is one the tool
      // still handles; only the advertising shrinks.
      const { inputSchema } = toolDef.toolOptions;
      const parsed = z
        .object(inputSchema)
        .safeParse(
          unsetEmptyParams(req.body as Record<string, unknown>, inputSchema),
        );

      if (!parsed.success) {
        res.status(400).json({
          error: "Validation failed",
          details: parsed.error.issues,
        });

        return;
      }

      try {
        const overrides = buildOverrides(formatOverride, timeoutOverride);

        const mcpResponse = (await buildCallLiveApi(profile)(
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

        appendDeprecationNotices(
          mcpResponse,
          toolName,
          toolDef.toolOptions.inputSchema,
          parsed.data,
        );

        res.json(unwrapMcpResponse(mcpResponse, formatOverride === "json"));
      } catch (error) {
        console.error(`REST API error calling ${toolName}: ${String(error)}`);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}

/**
 * Steers a REST caller off a hidden param, the way define-tool.ts does for MCP.
 * The catalog no longer lists the param, so this notice is the only signal a
 * REST caller gets that it is retired or a fallback.
 * @param response - The tool's response, appended to in place
 * @param toolName - Tool that was called
 * @param inputSchema - The tool's raw input schema
 * @param args - The validated arguments
 */
function appendDeprecationNotices(
  response: McpResponse,
  toolName: string,
  inputSchema: Record<string, ZodType>,
  args: Record<string, unknown>,
): void {
  const hidden = collectHiddenParams(inputSchema);
  const usedKeys = Object.keys(hidden).filter((key) => args[key] != null);

  for (const text of hiddenParamWarnings(toolName, usedKeys, hidden)) {
    response.content.push({ type: "text", text });
  }
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
