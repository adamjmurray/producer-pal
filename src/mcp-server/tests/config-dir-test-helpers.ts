// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared setup for tests that exercise the ~/.producer-pal config-dir stores
// and their REST routes against a real (temp) filesystem. Centralizes the
// PRODUCER_PAL_CONFIG_DIR override lifecycle and the tiny markdown-route server
// so per-feature test files don't each re-clone the boilerplate.

import { mkdtempSync, rmSync } from "node:fs";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import { afterEach, beforeEach } from "vitest";

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
