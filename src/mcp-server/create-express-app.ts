// Producer Pal
// Copyright (C) 2026 Adam Murray
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
import { TOOL_NAMES, createMcpServer } from "./create-mcp-server.ts";
import { callLiveApi } from "./max-api-adapter.ts";
import * as console from "./node-for-max-logger.ts";

interface ProducerPalConfig {
  memoryEnabled: boolean;
  memoryContent: string;
  memoryWritable: boolean;
  smallModelMode: boolean;
  jsonOutput: boolean; // true = JSON, false = compact (default)
  sampleFolder: string;
  tools: string[];
}

const config: ProducerPalConfig = {
  memoryEnabled: false,
  memoryContent: "",
  memoryWritable: false,
  smallModelMode: false,
  jsonOutput: false,
  sampleFolder: "",
  tools: [...TOOL_NAMES],
};

let chatUIEnabled = true; // default

Max.addHandler(
  "chatUIEnabled",
  (enabled: unknown) => (chatUIEnabled = Boolean(enabled)),
);

Max.addHandler("smallModelMode", (enabled: unknown) => {
  // console.log(`[node] Setting smallModelMode ${Boolean(enabled)}`);
  config.smallModelMode = Boolean(enabled);
});

Max.addHandler("memoryEnabled", (enabled: unknown) => {
  // console.log(`[node] Setting memoryEnabled ${Boolean(enabled)}`);
  config.memoryEnabled = Boolean(enabled);
});

Max.addHandler("memoryContent", (content: unknown) => {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = content === "bang" ? "" : String(content ?? "");

  // console.log(`[node] Setting memoryContent ${value}`);
  config.memoryContent = value;
});

Max.addHandler("memoryWritable", (writable: unknown) => {
  // console.log(`[node] Setting memoryWritable ${Boolean(writable)}`);
  config.memoryWritable = Boolean(writable);
});

Max.addHandler("compactOutput", (enabled: unknown) => {
  // console.log(`[node] Setting compactOutput ${!enabled}`);
  config.jsonOutput = !enabled;
});

Max.addHandler("sampleFolder", (path: unknown) => {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = path === "bang" ? "" : String(path ?? "");

  // console.log(`[node] Setting sampleFolder ${value}`);
  config.sampleFolder = value;
});

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
 * Creates and configures an Express application for the MCP server
 *
 * @returns Configured Express app
 */
export function createExpressApp(): Express {
  const app = express();

  // CORS middleware for MCP Inspector support
  app.use((req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(200).end();

      return;
    }

    next();
  });

  app.use(express.json());

  app.post("/mcp", async (req: Request, res: Response): Promise<void> => {
    try {
      console.info("New MCP connection: " + JSON.stringify(req.body));

      const server = createMcpServer(callLiveApi, {
        smallModelMode: config.smallModelMode,
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

  // Allow chat UI to be disabled for security
  app.use("/chat", (_req: Request, res: Response, next: NextFunction): void => {
    if (!chatUIEnabled) {
      res.status(403).send("Chat UI is disabled");

      return;
    }

    next();
  });

  // Serve the chat UI (inlined for frozen .amxd builds)
  app.get("/chat", (_req: Request, res: Response): void => {
    res.type("html").send(chatUiHtml);
  });

  // Config endpoints for device UI settings
  app.get("/config", (_req: Request, res: Response): void => {
    res.json(config);
  });

  app.post("/config", async (req: Request, res: Response): Promise<void> => {
    const incoming = req.body as Partial<ProducerPalConfig>;
    const outlets: Array<() => Promise<void>> = [];

    if (incoming.memoryEnabled !== undefined) {
      config.memoryEnabled = Boolean(incoming.memoryEnabled);
      outlets.push(() =>
        Max.outlet("config", "memoryEnabled", config.memoryEnabled),
      );
    }

    if (incoming.memoryContent !== undefined) {
      config.memoryContent = incoming.memoryContent ?? "";
      outlets.push(() =>
        Max.outlet("config", "memoryContent", config.memoryContent),
      );
    }

    if (incoming.memoryWritable !== undefined) {
      config.memoryWritable = Boolean(incoming.memoryWritable);
      outlets.push(() =>
        Max.outlet("config", "memoryWritable", config.memoryWritable),
      );
    }

    if (incoming.smallModelMode !== undefined) {
      config.smallModelMode = Boolean(incoming.smallModelMode);
      outlets.push(() =>
        Max.outlet("config", "smallModelMode", config.smallModelMode),
      );
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

    if (incoming.tools !== undefined) {
      const validationError = validateTools(incoming.tools);

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
  });

  return app;
}

const VALID_TOOL_SET = new Set<string>(TOOL_NAMES);

/**
 * Validate the tools array from a config update request.
 * Returns an error object if invalid, or null if valid.
 *
 * @param tools - The tools value from the request body
 * @returns Error response body or null
 */
function validateTools(
  tools: unknown,
): { error: string; validToolNames: string[] } | null {
  if (!Array.isArray(tools)) {
    return {
      error: "tools must be an array of tool names",
      validToolNames: [...TOOL_NAMES],
    };
  }

  const list = tools.map(String);
  const invalid = list.filter((name) => !VALID_TOOL_SET.has(name));

  if (invalid.length > 0) {
    return {
      error: `Invalid tool name(s): ${invalid.join(", ")}`,
      validToolNames: [...TOOL_NAMES],
    };
  }

  if (!list.includes("ppal-connect")) {
    return {
      error:
        "ppal-connect must be included in tools (it is the required entry point)",
      validToolNames: [...TOOL_NAMES],
    };
  }

  return null;
}
