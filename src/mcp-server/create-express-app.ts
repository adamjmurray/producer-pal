// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response, NextFunction, Express } from "express";
import express from "express";
import Max from "max-api";
import chatUiHtml from "virtual:chat-ui-html";
import { errorMessage } from "#src/shared/error-utils.ts";
import { createMcpServer } from "./create-mcp-server.ts";
import { callLiveApi } from "./max-api-adapter.ts";
import * as console from "./node-for-max-logger.ts";

interface ProducerPalConfig {
  useProjectNotes: boolean;
  projectNotes: string;
  projectNotesWritable: boolean;
  smallModelMode: boolean;
  jsonOutput: boolean; // true = JSON, false = compact (default)
  sampleFolder: string;
}

const config: ProducerPalConfig = {
  useProjectNotes: false,
  projectNotes: "",
  projectNotesWritable: false,
  smallModelMode: false,
  jsonOutput: false,
  sampleFolder: "",
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

Max.addHandler("projectNotesEnabled", (enabled: unknown) => {
  // console.log(`[node] Setting projectNotesEnabled ${Boolean(enabled)}`);
  config.useProjectNotes = Boolean(enabled);
});

Max.addHandler("projectNotes", (content: unknown) => {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = content === "bang" ? "" : String(content ?? "");

  // console.log(`[node] Setting projectNotes ${value}`);
  config.projectNotes = value;
});

Max.addHandler("projectNotesWritable", (writable: unknown) => {
  // console.log(`[node] Setting projectNotesWritable ${Boolean(writable)}`);
  config.projectNotesWritable = Boolean(writable);
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

    if (incoming.useProjectNotes !== undefined) {
      config.useProjectNotes = Boolean(incoming.useProjectNotes);
      outlets.push(() =>
        Max.outlet("config", "projectNotesEnabled", config.useProjectNotes),
      );
    }

    if (incoming.projectNotes !== undefined) {
      config.projectNotes = incoming.projectNotes ?? "";
      outlets.push(() =>
        Max.outlet("config", "projectNotes", config.projectNotes),
      );
    }

    if (incoming.projectNotesWritable !== undefined) {
      config.projectNotesWritable = Boolean(incoming.projectNotesWritable);
      outlets.push(() =>
        Max.outlet(
          "config",
          "projectNotesWritable",
          config.projectNotesWritable,
        ),
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

    // Emit all config updates to V8 (after synchronously updating config)
    for (const emit of outlets) {
      await emit();
    }

    res.json(config);
  });

  return app;
}
