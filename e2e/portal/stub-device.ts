// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A stand-in for the Max device's MCP server, so a test can decide when the
// device is reachable. The offline→online transition is the point of these
// tests, and no real Ableton Live can be switched on halfway through one.
//
// The device is the collaborator here, not the subject. Narrowing a tool list by
// the disabled-tools header is the device's job and is tested on that side; what
// the portal owes is the header itself. So the stub records what it was sent
// rather than acting on it, and answers with one unmistakable marker tool — any
// list containing it came from the device, not the portal's offline fallback.

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { createServer as createNetServer } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/** The only tool the stub device offers. */
export const DEVICE_TOOL = "ppal-device-marker";

/** What that tool answers with. */
export const DEVICE_TOOL_REPLY = "the device answered";

/**
 * Mirrors DISABLED_TOOLS_HEADER in src/shared/config.ts. Spelled out rather than
 * imported: it is a wire contract, and a test that imported the constant would
 * follow a rename instead of catching it.
 */
export const DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools";

/** One request the device received. */
export interface DeviceRequest {
  /** The JSON-RPC method, e.g. "tools/list". */
  method: string;
  /** The disabled-tools header, or undefined when the portal sent none. */
  disabledTools: string | undefined;
}

/** The fake device under a test's control. */
export interface StubDevice {
  /** What to point the portal at, e.g. http://127.0.0.1:53211 */
  origin: string;
  /** Every MCP request received, in order. */
  requests: DeviceRequest[];
  /** Begin answering on the reserved port. */
  start: () => Promise<void>;
  /** Stop answering, as if Ableton quit. */
  stop: () => Promise<void>;
}

/**
 * Create a stub device on a free port.
 * @param options - Whether it answers from the start
 * @param options.online - False to reserve the port but stay unreachable
 * @returns The device
 */
export async function createStubDevice(
  options: { online?: boolean } = {},
): Promise<StubDevice> {
  const port = await reservePort();
  const requests: DeviceRequest[] = [];
  const server = createHttpServer((req, res) => {
    void handleRequest(req, res, requests);
  });
  const device: StubDevice = {
    origin: `http://127.0.0.1:${port}`,
    requests,
    start: () => listen(server, port),
    stop: () => close(server),
  };

  if (options.online !== false) await device.start();

  return device;
}

// --- Helpers below main exports ---

/**
 * Answer one HTTP request. Each POST /mcp gets its own server and transport, the
 * same stateless shape the real device serves.
 * @param req - The incoming request
 * @param res - The response to write
 * @param requests - The recorder to append to
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requests: DeviceRequest[],
): Promise<void> {
  const isMcp = req.url?.startsWith("/mcp") ?? false;

  if (!isMcp || req.method !== "POST") {
    // The real server answers GET/DELETE /mcp with 405 so the SDK client stops
    // trying to open an SSE stream. Anything else simply isn't there.
    res.writeHead(isMcp ? 405 : 404).end();

    return;
  }

  const body = await readJsonBody(req);

  requests.push({
    method: methodOf(body),
    disabledTools: headerValue(req, DISABLED_TOOLS_HEADER),
  });

  const server = new McpServer({ name: "stub-device", version: "1.0.0" });

  server.registerTool(
    DEVICE_TOOL,
    { description: "Proof that a tool list came from the device." },
    () => ({ content: [{ type: "text" as const, text: DEVICE_TOOL_REPLY }] }),
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless, like the device's own server
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

/**
 * Find a free port and release it, so the device can claim it later — the only
 * way to point a portal at a device that isn't listening yet.
 * @returns The port number
 */
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();

    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      if (address == null || typeof address === "string") {
        reject(new Error("Could not reserve a port for the stub device"));

        return;
      }

      probe.close(() => resolve(address.port));
    });
  });
}

/**
 * Start listening.
 * @param server - The device's HTTP server
 * @param port - The reserved port
 */
function listen(server: HttpServer, port: number): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

/**
 * Stop listening, dropping live connections.
 * @param server - The device's HTTP server
 */
function close(server: HttpServer): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();

      return;
    }

    // The portal's HTTP client keeps its socket alive, which would hold close()
    // open until that socket times out.
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

/**
 * Read and parse a JSON request body.
 * @param req - The incoming request
 * @returns The parsed body
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(chunk as Buffer);

  return JSON.parse(Buffer.concat(chunks).toString());
}

/**
 * The JSON-RPC method of a request body.
 * @param body - The parsed body
 * @returns The method name, or "unknown"
 */
function methodOf(body: unknown): string {
  const method = (body as { method?: unknown } | null)?.method;

  return typeof method === "string" ? method : "unknown";
}

/**
 * Read one request header.
 * @param req - The incoming request
 * @param name - The header name, lowercase
 * @returns The value, or undefined when absent
 */
function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];

  return Array.isArray(value) ? value.join(",") : value;
}
