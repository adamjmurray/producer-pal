// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared setup for tests that exercise the ~/.producer-pal config-dir stores
// and their REST routes against a real (temp) filesystem. Centralizes the
// PRODUCER_PAL_CONFIG_DIR override lifecycle, the tiny markdown-route server,
// and the V8↔Node RPC-route dispatch harness so per-feature test files don't
// each re-clone the boilerplate.

import { mkdtempSync, rmSync } from "node:fs";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import Max from "max-api";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { handleNodeRequest } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";

/**
 * Register beforeEach/afterEach hooks that point PRODUCER_PAL_CONFIG_DIR at a
 * fresh temp dir for each test (so the config stores read/write real files
 * without touching the developer's home) and restore the prior value after.
 *
 * @returns A getter for the current test's temp config directory
 */
export function useTempConfigDir(): () => string {
  const originalDir = process.env.PRODUCER_PAL_CONFIG_DIR;
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-cfg-"));
    process.env.PRODUCER_PAL_CONFIG_DIR = dir;
  });

  afterEach(() => {
    if (originalDir == null) {
      delete process.env.PRODUCER_PAL_CONFIG_DIR;
    } else {
      process.env.PRODUCER_PAL_CONFIG_DIR = originalDir;
    }

    rmSync(dir, { recursive: true, force: true });
  });

  return () => dir;
}

/** A started markdown-route test server plus a base URL and teardown. */
export interface MarkdownRouteServer {
  /** Base URL, e.g. http://localhost:12345 (no trailing path). */
  baseUrl: string;
  /** Stop the server. */
  close: () => Promise<void>;
}

/**
 * Start a bare Express app (JSON body parsing enabled) with the given route
 * registration, listening on an ephemeral port. Used by the config-markdown
 * route tests.
 *
 * @param register - Registers the route(s) under test on the app
 * @returns The started server's base URL and a close function
 */
export async function startMarkdownRouteServer(
  register: (app: Express) => void,
): Promise<MarkdownRouteServer> {
  const app = express();

  app.use(express.json());
  register(app);

  const server: Server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * PUT a JSON body to a config-markdown endpoint.
 *
 * @param url - Fully-qualified endpoint URL
 * @param body - Request body (sent as JSON)
 * @param origin - Optional Origin header to exercise the localhost gate
 * @returns The fetch Response
 */
export function putJson(
  url: string,
  body: unknown,
  origin?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin != null) headers.Origin = origin;

  return fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
}

/** The parsed `{ content }` payload every V8↔Node RPC route sends back. */
export interface ParsedNodeResponse {
  success: boolean;
  result?: { content?: string };
  error?: string;
}

/**
 * Reassemble and parse the response JSON from the chunked `node_response`
 * Max.outlet call the RPC dispatcher makes. Reads the first outlet call, so
 * clear the Max.outlet mock between dispatches (per-test `vi.clearAllMocks`).
 *
 * @returns The parsed node response
 */
export function parseSentNodeResponse(): ParsedNodeResponse {
  const [name, , ...rest] = vi.mocked(Max.outlet).mock.calls[0] ?? [];

  expect(name).toBe("node_response");

  const delimiterIndex = rest.indexOf(MAX_ERROR_DELIMITER);
  const chunks = rest.slice(0, delimiterIndex) as string[];

  return JSON.parse(chunks.join("")) as ParsedNodeResponse;
}

/**
 * Dispatch one node route through the RPC protocol and return the parsed
 * response. The shared harness for the config-dir node-route tests (global
 * context, memory, custom skills).
 *
 * @param route - The route name (e.g. "memory.read")
 * @param args - The route args
 * @returns The parsed node response
 */
export async function dispatchNodeRoute(
  route: string,
  args: unknown,
): Promise<ParsedNodeResponse> {
  await handleNodeRequest("id", JSON.stringify({ route, args }));

  return parseSentNodeResponse();
}
