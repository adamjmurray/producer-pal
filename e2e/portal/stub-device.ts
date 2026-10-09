// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A stand-in for the Max device's MCP server, so a test can decide when the
// device is reachable: no real Ableton Live can be switched on halfway through
// a test.
//
// The device is the collaborator here, not the subject, so the stub records what
// it was sent rather than acting on it, and answers with one marker tool: any
// list containing it came from the device, not the portal's offline fallback.

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { closeServer, reservePort } from "./local-server";
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

/** The per-client setting headers, spelled out for the same reason. */
export const SETTING_HEADERS = {
  smallModelMode: "x-producer-pal-small-model-mode",
  notation: "x-producer-pal-notation",
  format: "x-producer-pal-format",
  liveApi: "x-producer-pal-live-api",
} as const;

/** One setting per key, absent when the portal sent no header for it. */
export type DeviceSettings = Partial<
  Record<keyof typeof SETTING_HEADERS, string>
>;

/** One request the device received. */
export interface DeviceRequest {
  /** The JSON-RPC method, e.g. "tools/list". */
  method: string;
  /** The disabled-tools header, or undefined when the portal sent none. */
  disabledTools: string | undefined;
  /** The setting headers that rode along, if any. */
  settings: DeviceSettings;
}

/** The fake device under a test's control. */
export interface StubDevice {
  /** What to point the portal at, e.g. http://127.0.0.1:53211 */
  origin: string;
  /** Every MCP request received, in order. */
  requests: DeviceRequest[];
  /** The server version it reports; set it to play a swapped device */
  version: string;
  /** Begin answering on the reserved port. */
  start: () => Promise<void>;
  /** Stop answering, as if Ableton quit. */
  stop: () => Promise<void>;
}

/**
 * Create a stub device on a free port.
 * @param options - Whether it answers from the start, and what it reports
 * @param options.online - False to reserve the port but stay unreachable
 * @param options.version - The server version it reports
 * @returns The device
 */
export async function createStubDevice(
  options: { online?: boolean; version?: string } = {},
): Promise<StubDevice> {
  const port = await reservePort();
  const requests: DeviceRequest[] = [];
  const server = createHttpServer((req, res) => {
    void handleRequest(req, res, requests, device.version);
  });
  const device: StubDevice = {
    origin: `http://127.0.0.1:${port}`,
    requests,
    version: options.version ?? "1.0.0",
    start: () => listen(server, port),
    stop: () => closeServer(server),
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
 * @param version - The server version to report
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requests: DeviceRequest[],
  version: string,
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
    settings: settingsOf(req),
  });

  const server = new McpServer({ name: "stub-device", version });

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
 * Collect the setting headers one request carried, skipping the absent ones so
 * "sent nothing" and "sent an empty value" stay distinguishable.
 * @param req - The incoming request
 * @returns The settings that were sent
 */
function settingsOf(req: IncomingMessage): DeviceSettings {
  const settings: DeviceSettings = {};

  for (const [key, header] of Object.entries(SETTING_HEADERS)) {
    const value = headerValue(req, header);

    if (value != null) settings[key as keyof DeviceSettings] = value;
  }

  return settings;
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
