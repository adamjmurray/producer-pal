// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Shared setup for tests that exercise the ~/.producer-pal config-dir stores
// and their REST routes against a real (temp) filesystem. Centralizes the
// PRODUCER_PAL_CONFIG_DIR override lifecycle, the tiny markdown-route server,
// and the V8↔Node RPC-route dispatch harness so per-feature test files don't
// each re-clone the boilerplate.

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import type * as NodeFs from "node:fs";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Express } from "express";
import Max from "max-api";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { type CallLiveApiFunction } from "#src/mcp-server/create-mcp-server.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";
import { VERSION } from "#src/shared/config.ts";
import { handleNodeRequest } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { END_OF_CHUNKS } from "#src/shared/mcp-responses.ts";

/**
 * Build a fake inner callLiveApi that resolves to the given response. Shared by
 * the connect-append inject-seam tests (withMemory / withCustomSkills).
 * @param response - The McpResponse the fake should resolve with
 * @returns A callLiveApi that ignores its args and resolves to the response
 */
export function fakeInnerCall(response: McpResponse): CallLiveApiFunction {
  return vi.fn(async () => response);
}

/**
 * A minimal successful connect-style response with a single content block.
 * @returns A fresh McpResponse
 */
export function connectResponse(): McpResponse {
  return { content: [{ type: "text", text: "{connected:true}" }] };
}

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
    failingPaths.clear();

    for (const path of lockedPaths) {
      chmodSync(path, 0o700);
    }

    lockedPaths.clear();

    if (originalDir == null) {
      delete process.env.PRODUCER_PAL_CONFIG_DIR;
    } else {
      process.env.PRODUCER_PAL_CONFIG_DIR = originalDir;
    }

    rmSync(dir, { recursive: true, force: true });
  });

  return () => dir;
}

/** Paths whose reads and directory listings {@link withFsFaults} fails. */
const failingPaths = new Set<string>();

/** Paths chmod'ed shut, reopened after each test so the temp dir can go. */
const lockedPaths = new Set<string>();

/**
 * Wrap `node:fs` so reads and listings of paths passed to {@link failFsAt}
 * throw EACCES. For a `vi.mock(import("node:fs"), ...)` factory: unlike chmod,
 * it also blocks root.
 *
 * @param actual - The real `node:fs` module
 * @returns The module with failing reads/listings for the chosen paths
 */
export function withFsFaults(actual: typeof NodeFs): typeof actual {
  const guard = <Fn extends (path: never, ...rest: never[]) => unknown>(
    real: Fn,
  ): Fn =>
    ((path: never, ...rest: never[]) => {
      if (failingPaths.has(String(path))) {
        throw Object.assign(
          new Error(`EACCES: permission denied, ${String(path)}`),
          {
            code: "EACCES",
          },
        );
      }

      return real(path, ...rest);
    }) as Fn;

  return {
    ...actual,
    readFileSync: guard(actual.readFileSync),
    readdirSync: guard(actual.readdirSync),
  };
}

/**
 * Make reads of this path fail (see {@link withFsFaults}); cleared after each
 * test.
 *
 * @param path - Absolute path to fail
 */
export function failFsAt(path: string): void {
  failingPaths.add(path);
}

/**
 * Make a file fail to read (EACCES) via chmod, while it still lists as a
 * regular file.
 * @param path - Absolute path of the file or folder
 */
function chmodUnreadable(path: string): void {
  chmodSync(path, 0o000);
  lockedPaths.add(path);
}

/**
 * Ways to make a file or folder unreadable, for `describe.each`. chmod is
 * skipped on Windows and as root (who reads anything).
 */
export const unreadableWays = [
  { way: "a failing read", supported: true, block: failFsAt },
  {
    way: "chmod 000",
    supported: process.platform !== "win32" && process.getuid?.() !== 0,
    block: chmodUnreadable,
  },
];

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

  if (origin != null) {
    headers.Origin = origin;
  }

  return fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
}

/** The parsed payload a V8↔Node RPC route sends back. */
export interface ParsedNodeResponse<TResult = { content?: string }> {
  success: boolean;
  result?: TResult;
  error?: string;
}

/**
 * Reassemble and parse the response JSON from the chunked `node_response`
 * Max.outlet call the RPC dispatcher makes. Reads the first outlet call, so
 * clear the Max.outlet mock between dispatches (per-test `vi.clearAllMocks`).
 *
 * @returns The parsed node response
 */
export function parseSentNodeResponse<
  TResult = { content?: string },
>(): ParsedNodeResponse<TResult> {
  const [name, , ...rest] = vi.mocked(Max.outlet).mock.calls[0] ?? [];

  expect(name).toBe("node_response");

  const delimiterIndex = rest.indexOf(END_OF_CHUNKS);

  expect(delimiterIndex).toBeGreaterThanOrEqual(0);

  const chunks = rest.slice(0, delimiterIndex) as string[];

  return JSON.parse(chunks.join("")) as ParsedNodeResponse<TResult>;
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

/**
 * Assert a config-dir store wrote provenance frontmatter above the body: the
 * file opens with a `---` block carrying the version it was forked at and the
 * built-in's hash, and ends with the content the caller saved.
 *
 * @param raw - The file's contents as written to disk
 * @param body - The content the store was asked to save
 */
export function expectProvenanceFrontmatter(raw: string, body: string): void {
  expect(raw.startsWith("---\n")).toBe(true);
  expect(raw).toContain(`producerPalVersion: ${VERSION}`);
  expect(raw).toContain("builtInHash: ");
  expect(raw.trimEnd().endsWith(body)).toBe(true);
}

/**
 * Read the \`error\` field out of a route response body.
 *
 * @param res - The response whose JSON body carries the error
 * @returns The error message
 */
export async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}
