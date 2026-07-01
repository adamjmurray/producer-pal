// Producer Pal
// Copyright (C) 2026 Adam Murray, Eike Haß
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type Express,
} from "express";
import Max from "max-api";
import chatUiHtml from "virtual:chat-ui-html";
import { errorMessage } from "#src/shared/error-utils.ts";
import {
  DEFAULT_NOTATION,
  isNotation,
  type Notation,
} from "#src/shared/notation.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { TOOL_NAMES, createMcpServer } from "./create-mcp-server.ts";
import { withGlobalContext } from "./helpers/global-context-inject.ts";
import { isLocalOrigin } from "./helpers/request-origin.ts";
import { revealConfigDir } from "./helpers/reveal-config-dir.ts";
import { withSkills } from "./helpers/skills-inject.ts";
import { callLiveApi } from "./max-api-adapter.ts";
import * as console from "./node-for-max-logger.ts";
import { registerGeminiVoiceTokenRoute } from "./routes/gemini-voice-token-route.ts";
import { registerGlobalContextRoutes } from "./routes/global-context-route.ts";
import { registerRestApiRoutes } from "./routes/rest-api-routes.ts";
import { registerSkillOverridesRoutes } from "./routes/skill-overrides-route.ts";
import { registerSystemPromptRoutes } from "./routes/system-prompt-route.ts";
import { registerVoiceTokenRoute } from "./routes/voice-token-route.ts";

const LIVE_API_TOOL_NAME = toolDefLiveApi.toolName;

interface ProducerPalConfig {
  memoryContent: string;
  smallModelMode: boolean;
  notation: Notation;
  jsonOutput: boolean; // true = JSON, false = compact (default)
  sampleFolder: string;
  liveApiEnabled: boolean;
  liveApiForcedOn: boolean;
  tools: string[];
}

// ENABLE_LIVE_API=true forces the Live API tool on for dev builds
// (npm run dev:debug / build:debug). When set, the device Setup-tab toggle
// cannot disable it — the Max handler at "liveApiEnabled" ignores
// device-side `false` updates and re-emits the forced value.
//
// Asymmetry: POST /config remains authoritative in both directions even
// when the env var is set. This is intentional so e2e tests can exercise
// the disabled-state code paths without rebuilding. Production deployments
// don't set ENABLE_LIVE_API, so the asymmetry is dev-only.
const liveApiForcedOn = process.env.ENABLE_LIVE_API === "true";

const config: ProducerPalConfig = {
  memoryContent: "",
  smallModelMode: false,
  notation: DEFAULT_NOTATION,
  jsonOutput: false,
  sampleFolder: "",
  liveApiEnabled: liveApiForcedOn,
  liveApiForcedOn,
  tools: liveApiForcedOn
    ? [...TOOL_NAMES, toolDefLiveApi.toolName]
    : [...TOOL_NAMES],
};

Max.addHandler("smallModelMode", (enabled: unknown) => {
  config.smallModelMode = Boolean(enabled);
});

Max.addHandler("notation", (value: unknown) => {
  // Ignore unrecognized values so a stray device message can't wedge the
  // setting into an invalid state — keep the current notation instead.
  if (isNotation(value)) {
    config.notation = value;
  }
});

Max.addHandler("memoryContent", (content: unknown) => {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = content === "bang" ? "" : String(content ?? "");

  config.memoryContent = value;
});

Max.addHandler("compactOutput", (enabled: unknown) => {
  config.jsonOutput = !enabled;
});

Max.addHandler("sampleFolder", (path: unknown) => {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = path === "bang" ? "" : String(path ?? "");

  config.sampleFolder = value;
});

Max.addHandler("liveApiEnabled", (enabled: unknown) => {
  const next = Boolean(enabled);

  if (liveApiForcedOn && !next) {
    // Env var forces this on — re-emit the current value so the device
    // toggle UI snaps back to its forced state.
    void Max.outlet("config", "liveApiEnabled", config.liveApiEnabled);

    return;
  }

  applyLiveApiEnabled(next);
});

// Device button: reveal ~/.producer-pal in the OS file browser. The button
// sends "openConfigFolder"; Node resolves the home dir and emits it back as a
// file:// URL for the patch to open via `max launchbrowser` (see
// reveal-config-dir.ts).
Max.addHandler("openConfigFolder", () => {
  revealConfigDir();
});

/**
 * Apply a liveApiEnabled change to runtime config and the tools whitelist.
 * Keeps config.tools symmetric with config.liveApiEnabled so the tool name
 * never lingers in the whitelist while the flag is off (which would silently
 * drop on a later validateTools call).
 *
 * @param next - The new value of liveApiEnabled
 */
function applyLiveApiEnabled(next: boolean): void {
  config.liveApiEnabled = next;

  const has = config.tools.includes(LIVE_API_TOOL_NAME);

  if (next && !has) {
    config.tools = [...config.tools, LIVE_API_TOOL_NAME];
  } else if (!next && has) {
    config.tools = config.tools.filter((t) => t !== LIVE_API_TOOL_NAME);
  }
}

// Enrich ppal-connect Node-side: withSkills appends the (override-aware) skills
// blob, withGlobalContext appends the machine-global context. Both read the
// filesystem, which only Node can do — V8's connect() no longer builds skills.
const callLiveApiEnriched = withGlobalContext(
  withSkills(callLiveApi, () => ({
    notation: config.notation,
    smallModelMode: config.smallModelMode,
  })),
);

interface JsonRpcError {
  jsonrpc: string;
  error: {
    code: number;
    message: string;
  };
  id: null;
}

const methodNotAllowed: JsonRpcError = {
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.ConnectionClosed,
    message: "Method not allowed.",
  },
  id: null,
};

const internalError = (message: string): JsonRpcError => ({
  jsonrpc: "2.0",
  error: {
    code: ErrorCode.InternalError,
    message: `Internal server error: ${message}`,
  },
  id: null,
});

/**
 * Mark a response as never-cache. Used for the UI bundle and config so the
 * browser can't serve a stale build/config across device rebuilds or updates.
 * @param res - Express response
 */
function setNoStore(res: Response): void {
  res.set("Cache-Control", "no-store");
}

/**
 * Creates and configures an Express application for the MCP server
 *
 * @returns Configured Express app
 */
export function createExpressApp(): Express {
  const app = express();

  // CORS middleware for MCP Inspector and Vite dev server support.
  // Only enabled in dev builds (ENABLE_DEV_CORS=true). Production builds
  // serve the chat UI from the same origin, so no CORS headers are needed.
  if (process.env.ENABLE_DEV_CORS === "true") {
    app.use((req: Request, res: Response, next: NextFunction): void => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, DELETE",
      );
      res.setHeader("Access-Control-Allow-Headers", "*");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        res.status(200).end();

        return;
      }

      next();
    });
  }

  // Tool arguments with large MIDI note arrays or bar|beat transforms can
  // exceed Express's 100 KB default.
  app.use(express.json({ limit: "2mb" }));

  // No cross-origin (Origin) gate here, intentionally — unlike POST /config.
  // The chat UI's getMcpUrl() targets the page's own origin, so over a LAN or
  // tunnel it POSTs /mcp with a NON-localhost Origin (e.g. http://192.168.x:PORT
  // or https://*.trycloudflare.com). Gating by isLocalOrigin — or any
  // Origin/Host comparison, which reverse-proxy tunnels defeat by forwarding
  // Host=localhost while Origin stays the public domain — would 403 the
  // LAN/tunnel chat's own tool calls and break the documented web-tunnels
  // feature, which is unauthenticated by design (docs/installation/
  // web-tunnels.md). The localhost-CSRF surface (a web page POSTing to
  // http://localhost:PORT/mcp) is accepted as part of that "no auth" model.
  app.post("/mcp", async (req: Request, res: Response): Promise<void> => {
    try {
      const method =
        (req.body as { method?: string } | undefined)?.method ?? "unknown";

      console.info(`MCP request: ${method}`);

      const server = createMcpServer(callLiveApiEnriched, {
        smallModelMode: config.smallModelMode,
        liveApiEnabled: config.liveApiEnabled,
        tools: config.tools,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });

      res.on("close", () => {
        void transport.close();
        void server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`Error handling MCP request: ${String(error)}`);
      res.status(500).json(internalError(errorMessage(error)));
    }
  });

  // Stateless server doesn't support SSE streams, so GET is not allowed.
  // Returning 405 tells the MCP SDK not to attempt SSE reconnection.
  app.get("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });

  // Because we're using a stateless server, DELETE is not needed:
  app.delete("/mcp", (_req: Request, res: Response): void => {
    res.status(405).json(methodNotAllowed);
  });

  // Serve the chat UI (inlined for frozen .amxd builds).
  // The same bundle handles both /chat and /context — main.tsx reads
  // location.pathname to decide which view to render.
  app.get(["/chat", "/context"], (_req: Request, res: Response): void => {
    // Never cache the UI bundle. It's a single file served from localhost, so
    // caching saves nothing, but a stale cached build persists across device
    // rebuilds/updates — which silently reintroduces already-fixed bugs.
    setNoStore(res);
    res.type("html").send(chatUiHtml);
  });

  // Root redirects to /chat for direct browser visits.
  app.get("/", (_req: Request, res: Response): void => {
    // Match the UI bundle's no-store stance: a cached 302 would survive a
    // device rebuild/update, freezing the redirect target if it ever moves.
    setNoStore(res);
    res.redirect("/chat");
  });

  // /voice is an alias that serves the same single-page bundle as /chat. The
  // app picks chat vs. voice from the saved model (App.tsx), not the URL path,
  // so this just lets users open/bookmark /voice.
  app.get("/voice", (_req: Request, res: Response): void => {
    // See /chat handler: never cache the UI bundle.
    setNoStore(res);
    res.type("html").send(chatUiHtml);
  });

  // Config endpoints for device UI settings
  app.get("/config", (_req: Request, res: Response): void => {
    // Memory edits in the device or via AI need to surface on the next
    // browser fetch — never serve a cached snapshot.
    setNoStore(res);
    res.json(config);
  });

  app.post("/config", handleConfigUpdate);

  registerRestApiRoutes(app, () => config, callLiveApiEnriched);

  registerGlobalContextRoutes(app);
  registerSystemPromptRoutes(app);
  registerSkillOverridesRoutes(app);

  registerVoiceTokenRoute(app);
  registerGeminiVoiceTokenRoute(app);

  return app;
}

const VALID_TOOL_SET = new Set<string>(TOOL_NAMES);

/**
 * Build the set of valid tool names, including ppal-live-api when enabled.
 * @param liveApiEnabled - Current value of config.liveApiEnabled
 * @returns Set of valid tool names
 */
function getValidToolSet(liveApiEnabled: boolean): Set<string> {
  if (!liveApiEnabled) return VALID_TOOL_SET;

  return new Set<string>([...VALID_TOOL_SET, LIVE_API_TOOL_NAME]);
}

/**
 * Build the list of valid tool names for error responses.
 * @param liveApiEnabled - Current value of config.liveApiEnabled
 * @returns Sorted list of valid tool names
 */
function getValidToolNames(liveApiEnabled: boolean): string[] {
  if (!liveApiEnabled) return [...TOOL_NAMES];

  return [...TOOL_NAMES, LIVE_API_TOOL_NAME];
}

/**
 * Handle POST /config requests to update device UI settings
 *
 * @param req - Express request
 * @param res - Express response
 */
async function handleConfigUpdate(req: Request, res: Response): Promise<void> {
  // Block cross-origin writes even when dev CORS is permissive. Same-origin
  // fetches and non-browser clients (curl, scripts/ppal-client) omit Origin.
  // This localhost gate is deliberately NOT applied to /mcp or /api/tools (see
  // the /mcp handler): config writes are device-settings changes made from the
  // local machine, so gating them to localhost is acceptable, whereas the tool
  // endpoints must stay reachable from the LAN/tunnel chat's non-localhost
  // origin. Side effect: config writes from a LAN/tunnel browser are blocked —
  // an accepted limitation, not part of the remote-access feature's contract.
  const origin = req.get("Origin");

  if (origin && !isLocalOrigin(origin)) {
    res
      .status(403)
      .json({ error: "cross-origin /config writes are not allowed" });

    return;
  }

  const incoming = req.body as Partial<ProducerPalConfig>;
  const outlets: Array<() => Promise<void>> = [];

  if (incoming.memoryContent !== undefined) {
    config.memoryContent = incoming.memoryContent ?? "";
    outlets.push(() =>
      Max.outlet("config", "memoryContent", config.memoryContent),
    );
  }

  if (incoming.smallModelMode !== undefined) {
    config.smallModelMode = Boolean(incoming.smallModelMode);
    outlets.push(() =>
      Max.outlet("config", "smallModelMode", config.smallModelMode),
    );
  }

  if (incoming.notation !== undefined && isNotation(incoming.notation)) {
    config.notation = incoming.notation;
    outlets.push(() => Max.outlet("config", "notation", config.notation));
  }

  if (incoming.jsonOutput !== undefined) {
    config.jsonOutput = Boolean(incoming.jsonOutput);
    outlets.push(() =>
      Max.outlet("config", "compactOutput", !config.jsonOutput),
    );
  }

  if (incoming.sampleFolder !== undefined) {
    config.sampleFolder = incoming.sampleFolder ?? "";
    outlets.push(() =>
      Max.outlet("config", "sampleFolder", config.sampleFolder),
    );
  }

  if (incoming.liveApiEnabled !== undefined) {
    const next = Boolean(incoming.liveApiEnabled);
    const beforeTools = config.tools;

    applyLiveApiEnabled(next);

    if (config.tools !== beforeTools) {
      outlets.push(() =>
        Max.outlet("config", "tools", JSON.stringify(config.tools)),
      );
    }

    outlets.push(() =>
      Max.outlet("config", "liveApiEnabled", config.liveApiEnabled),
    );
  }

  if (incoming.tools !== undefined) {
    const validationError = validateTools(
      incoming.tools,
      config.liveApiEnabled,
    );

    if (validationError) {
      res.status(400).json(validationError);

      return;
    }

    config.tools = incoming.tools.map(String);
    outlets.push(() =>
      Max.outlet("config", "tools", JSON.stringify(config.tools)),
    );
  }

  // Emit all config updates to V8 (after synchronously updating config)
  for (const emit of outlets) {
    await emit();
  }

  res.json(config);
}

/**
 * Validate the tools array from a config update request.
 * Returns an error object if invalid, or null if valid.
 *
 * @param tools - The tools value from the request body
 * @param liveApiEnabled - Whether ppal-live-api is an accepted tool name
 * @returns Error response body or null
 */
function validateTools(
  tools: unknown,
  liveApiEnabled: boolean,
): { error: string; validToolNames: string[] } | null {
  const validToolNames = getValidToolNames(liveApiEnabled);
  const validToolSet = getValidToolSet(liveApiEnabled);

  if (!Array.isArray(tools)) {
    return {
      error: "tools must be an array of tool names",
      validToolNames,
    };
  }

  const list = tools.map(String);
  const invalid = list.filter((name) => !validToolSet.has(name));

  if (invalid.length > 0) {
    return {
      error: `Invalid tool name(s): ${invalid.join(", ")}`,
      validToolNames,
    };
  }

  if (!list.includes("ppal-connect")) {
    return {
      error:
        "ppal-connect must be included in tools (it is the required entry point)",
      validToolNames,
    };
  }

  return null;
}
