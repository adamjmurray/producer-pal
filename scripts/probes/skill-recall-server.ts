// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The real MCP server, with no Ableton behind it.
 *
 * Every transport the probe supports connects here, so an AI-SDK model and an
 * agent CLI see byte-identical `tools/list` output and a difference in results
 * is the model rather than the harness. It runs `createMcpServer` itself — not
 * a hand-written copy of the schemas — so the tool and param descriptions under
 * test are the ones we ship.
 *
 * `callLiveApi` is a stub. Probe questions ask for an answer, not an action, so
 * nothing should reach it; it returns a refusal rather than throwing so that a
 * model which calls anyway gets a clean turn and the probe still scores the
 * text it wrote.
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import { type Notation } from "#src/shared/notation.ts";

/** A running probe server. */
export interface SkillProbeServer {
  /** The MCP endpoint to hand a client. */
  url: string;
  close: () => Promise<void>;
}

const METHOD_NOT_ALLOWED = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed." },
  id: null,
};

/**
 * Start an MCP server publishing the real toolset with no Live API behind it.
 *
 * Listens on an ephemeral port so it cannot collide with a real Producer Pal
 * device on 3350, and runs stateless (a fresh server per POST) the way the
 * device's own endpoint does.
 *
 * @param options - Mode to publish schemas for
 * @param options.notation - Notation setting (defaults to bar|beat)
 * @param options.smallModelMode - Whether to publish the small-model schemas
 * @returns The running server's URL and a close function
 */
export async function startSkillProbeServer(options: {
  notation?: Notation;
  smallModelMode?: boolean;
}): Promise<SkillProbeServer> {
  const app = express();

  app.use(express.json());
  app.post("/mcp", (req: Request, res: Response) => {
    void handlePost(options, req, res);
  });
  // Stateless, so there is no SSE stream to open and no session to delete.
  // The 405 is what stops the SDK client retrying both.
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });
  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  const httpServer = await listenOnEphemeralPort(app);
  const address = httpServer.address();
  const port =
    typeof address === "object" && address != null ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * Serve one stateless MCP POST.
 *
 * @param options - Mode to publish schemas for
 * @param req - Express request
 * @param res - Express response
 */
async function handlePost(
  options: { notation?: Notation; smallModelMode?: boolean },
  req: Request,
  res: Response,
): Promise<void> {
  const server = createMcpServer(
    () =>
      Promise.resolve({
        error: "Probe server: no Ableton Live. Answer in text instead.",
      }),
    options,
  );
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

/**
 * Listen on a free port chosen by the OS.
 *
 * @param app - The express app to serve
 * @returns The listening HTTP server
 */
function listenOnEphemeralPort(
  app: express.Express,
): Promise<ReturnType<express.Express["listen"]>> {
  return new Promise((resolve, reject) => {
    const httpServer = app.listen(0, "127.0.0.1", () => resolve(httpServer));

    httpServer.on("error", reject);
  });
}
