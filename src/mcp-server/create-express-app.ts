// Producer Pal
// Copyright (C) 2026 Adam Murray, Eike Haß
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response, type Express } from "express";
import Max from "max-api";
import chatUiHtml from "virtual:chat-ui-html";
import { errorMessage } from "#src/shared/error-utils.ts";
import { textEditParamToString } from "#src/shared/max/max-atoms.ts";
import {
  DEFAULT_NOTATION,
  isNotation,
  type Notation,
} from "#src/shared/notation.ts";
import { withLiveApiTool } from "#src/shared/tool-groups.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import {
  TOOL_NAMES,
  createMcpServer,
  validateTools,
} from "./create-mcp-server.ts";
import { type WrappedCallLiveApi } from "./helpers/connect/connect-append.ts";
import { enrichConnect } from "./helpers/connect/enrich-connect.ts";
import { corsMiddleware } from "./helpers/http/cors-middleware.ts";
import { requestBody } from "./helpers/http/request-body.ts";
import { rejectCrossOriginWrite } from "./helpers/http/request-origin.ts";
import {
  resolveRequestProfile,
  type RequestProfile,
} from "./helpers/http/request-profile.ts";
import { getUpdate } from "./helpers/http/update-check.ts";
import { registerProjectContextBackupNodeRoutes } from "./helpers/project-context-backup/project-context-backup-node-routes.ts";
import { type RequestOverrides } from "./helpers/request-overrides/request-overrides.ts";
import { withDefaultOverrides } from "./helpers/request-overrides/default-overrides.ts";
import { callLiveApi } from "./max-api-adapter.ts";
import * as console from "./node-for-max-logger.ts";
import { registerCustomSkillsCollectionRoutes } from "./routes/custom-skills-collection-route.ts";
import { registerGlobalContextRoutes } from "./routes/config/global-context-route.ts";
import { registerGlobalSettingsRoutes } from "./routes/config/global-settings-route.ts";
import { registerMemoryCollectionRoutes } from "./routes/memory-collection-route.ts";
import { registerRestApiRoutes } from "./routes/rest-api-routes.ts";
import { registerSkillOverridesRoutes } from "./routes/skill-overrides-route.ts";
import { registerSkillsPreviewRoute } from "./routes/skills-preview-route.ts";
import { registerSubagentBriefingRoute } from "./routes/subagent-briefing-route.ts";
import { registerSystemPromptRoutes } from "./routes/config/system-prompt-route.ts";
import { registerGeminiVoiceTokenRoute } from "./routes/voice/gemini-voice-token-route.ts";
import { registerVoiceTokenRoute } from "./routes/voice/voice-token-route.ts";

interface ProducerPalConfig {
  projectContext: string;
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
  projectContext: "",
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

Max.addHandler("projectContext", (content: unknown) => {
  const value = textEditParamToString(content);

  config.projectContext = value;
});

// The V8 side calls projectContext.sync on tool calls to back the project
// context up to a sidecar beside the Live Set (surviving device upgrades). A
// restore updates our mirror directly so a restore during ppal-connect shows up
// in that response's injected project-context block — the Max round-trip that
// re-persists the param can't be relied on to land in time.
registerProjectContextBackupNodeRoutes({
  setProjectContext: (value: string) => {
    config.projectContext = value;
  },
});

Max.addHandler("compactOutput", (enabled: unknown) => {
  config.jsonOutput = !enabled;
});

Max.addHandler("sampleFolder", (path: unknown) => {
  const value = textEditParamToString(path);

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
  config.tools = withLiveApiTool(config.tools, next);
}

/**
 * Enrich ppal-connect Node-side with the skills, context, memory, and next-step
 * blocks (see enrich-connect.ts for the block order and why it matters).
 * config.projectContext is the per-Live Set context blob. smallModelMode, the
 * toolset, and notation arrive through getters (not config directly) so a
 * request can supply its own per-request values — the same values that shrink
 * its tool schemas and its registered tools. POST /mcp and the REST tool
 * endpoints both override them, off the same headers.
 *
 * Notation is also pushed down as a request override (withDefaultOverrides), so
 * the notation the skills teach is the one V8 actually parses and formats notes
 * in. It wraps the inner call, inside the connect-enrichment chain.
 *
 * @param getSmallModelMode - Reads the small-model mode for this wrapper's calls
 * @param getTools - Reads the toolset skills fragments are gated on
 * @param getNotation - Reads the notation for this wrapper's calls
 * @param getCompactOutput - Reads the output format, or undefined to leave the
 *   device's own setting alone
 * @returns A callLiveApi whose ppal-connect results carry every block
 */
function buildEnrichedCall(
  getSmallModelMode: () => boolean,
  getTools: () => readonly string[],
  getNotation: () => Notation,
  getCompactOutput: () => boolean | undefined = () => undefined,
): WrappedCallLiveApi {
  return enrichConnect(
    withDefaultOverrides(callLiveApi, () => {
      const overrides: RequestOverrides = { notation: getNotation() };
      const compactOutput = getCompactOutput();

      // Only when a header asked: an absent one must leave V8 on its own
      // global rather than pin it to Node's mirror of the device setting.
      if (compactOutput !== undefined) overrides.compactOutput = compactOutput;

      return overrides;
    }),
    () => ({
      notation: getNotation(),
      smallModelMode: getSmallModelMode(),
      projectContext: config.projectContext,
      tools: getTools(),
    }),
  );
}

/**
 * Build the enriched call for one REST request from that request's profile —
 * the same per-request values POST /mcp resolves, off the same headers. The
 * output format is left out: REST already has `?format=`, which the route
 * passes as an explicit override on each call.
 *
 * @param profile - The resolved settings for this request
 * @returns A callLiveApi for this one request
 */
function buildRestCall(profile: RequestProfile): WrappedCallLiveApi {
  return buildEnrichedCall(
    () => profile.smallModelMode,
    () => profile.tools,
    () => profile.notation,
  );
}

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

  // Localhost-only CORS by default; ENABLE_REMOTE_CORS widens it (see the
  // middleware for the reasoning).
  app.use(corsMiddleware);

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

      // The caller's own profile, off the per-request headers: the
      // built-in chat and each subagent worker send their own values, so one
      // caller's never reach the concurrently-running main session (a POST
      // /config would). Absent ⇒ the globals, so external MCP clients are
      // unaffected. See resolveRequestProfile for what each one drives.
      //
      // The output format arrives as a header rather than the REST endpoints'
      // ?format= — query params on /mcp are not something MCP clients do. Still
      // no per-request timeout: that exists for slow machines, which is a
      // device-wide fact, not a per-call one.
      const profile = resolveRequestProfile(req, config);

      const server = createMcpServer(
        buildEnrichedCall(
          () => profile.smallModelMode,
          () => profile.tools,
          () => profile.notation,
          () => profile.compactOutput,
        ),
        {
          smallModelMode: profile.smallModelMode,
          notation: profile.notation,
          liveApiEnabled: profile.liveApiEnabled,
          tools: profile.tools,
        },
      );
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

  // The chat UI's update badge. It reads this instead of GitHub directly:
  // GitHub's unauthenticated limit is per IP, and the UI remounts every time the
  // window is opened. Served from the one check made at startup (update-check.ts),
  // so this route never reaches the network.
  app.get("/update", (_req: Request, res: Response): void => {
    setNoStore(res);
    void getUpdate().then((update) => res.json(update));
  });

  registerRestApiRoutes(app, () => config, buildRestCall);

  registerGlobalContextRoutes(app);
  registerGlobalSettingsRoutes(app);
  registerMemoryCollectionRoutes(app);
  registerCustomSkillsCollectionRoutes(app);
  registerSystemPromptRoutes(app);
  registerSkillOverridesRoutes(app);
  registerSkillsPreviewRoute(app, () => config.tools);
  // Raw callLiveApi, not the enriched one: the briefing composes its own blocks
  // in worker order and must not inherit the user-facing connect enrichment.
  registerSubagentBriefingRoute(app, () => config, callLiveApi);

  registerVoiceTokenRoute(app);
  registerGeminiVoiceTokenRoute(app);

  return app;
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
  if (
    rejectCrossOriginWrite(
      req,
      res,
      "cross-origin /config writes are not allowed",
    )
  ) {
    return;
  }

  // requestBody normalizes a missing/non-object body to {} so a bodyless POST
  // /config (no Content-Type: application/json) is a benign no-op update
  // instead of a TypeError → 500.
  const incoming = requestBody(req) as Partial<ProducerPalConfig>;
  const outlets: Array<() => Promise<void>> = [];

  if (incoming.projectContext !== undefined) {
    config.projectContext = incoming.projectContext ?? "";
    outlets.push(() =>
      Max.outlet("config", "projectContext", config.projectContext),
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
