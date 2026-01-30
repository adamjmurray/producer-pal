/**
 * Shared test utilities for MCP e2e tests
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/shared/mcp.ts";
import { openLiveSet } from "#evals/eval/open-live-set.ts";

export { extractToolResultText };

export const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";
export const CONFIG_URL = MCP_URL.replace("/mcp", "/config");
export const LIVE_SET_PATH =
  "evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";

/**
 * Configuration options that can be set via the /config endpoint
 */
export interface ConfigOptions {
  useProjectNotes?: boolean;
  projectNotes?: string;
  projectNotesWritable?: boolean;
  smallModelMode?: boolean;
  jsonOutput?: boolean;
  sampleFolder?: string;
}

/**
 * Update server config via the /config endpoint
 */
export async function setConfig(options: ConfigOptions): Promise<void> {
  const response = await fetch(CONFIG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Failed to set config: ${response.status}`);
  }
}

/**
 * Reset server config to defaults:
 * - smallModelMode: false
 * - useProjectNotes: false
 * - projectNotes: ""
 * - projectNotesWritable: false
 * - jsonOutput: false (compact output)
 * - sampleFolder: ""
 */
export async function resetConfig(): Promise<void> {
  await setConfig({
    smallModelMode: false,
    useProjectNotes: false,
    projectNotes: "",
    projectNotesWritable: false,
    jsonOutput: false,
    sampleFolder: "",
  });
}

/**
 * Parse the compact JS literal format used by Producer Pal to save tokens.
 * Uses eval since the format is valid JS but not valid JSON (unquoted keys).
 * Safe here since we're only parsing trusted MCP server responses in local tests.
 */
export function parseCompactJSLiteral<T>(text: string): T {
  // eslint-disable-next-line no-eval -- Parsing trusted MCP server response in local e2e test
  return eval(`(${text})`) as T;
}

/**
 * Sleep for a specified number of milliseconds.
 * Useful for waiting for Live API state to settle.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * MCP test context containing the client connection.
 * Use with setupMcpTestContext() to initialize.
 */
export interface McpTestContext {
  connection: McpConnection | null;
  client: Client | null;
}

interface SetupOptions {
  /** Use beforeAll/afterAll instead of beforeEach/afterEach (reuses connection across tests) */
  once?: boolean;
}

/**
 * Sets up hooks for MCP e2e tests.
 * Returns a context object that will be populated with the client after setup.
 *
 * @param options.once - If true, uses beforeAll/afterAll (faster for multiple tests that don't need fresh state)
 *
 * Usage:
 *   const ctx = setupMcpTestContext();
 *   it("test", () => { ctx.client!.callTool(...); });
 */
export function setupMcpTestContext(options?: SetupOptions): McpTestContext {
  const ctx: McpTestContext = { connection: null, client: null };
  const setup = options?.once ? beforeAll : beforeEach;
  const teardown = options?.once ? afterAll : afterEach;

  setup(async () => {
    await openLiveSet(LIVE_SET_PATH);
    ctx.connection = await connectMcp(MCP_URL);
    ctx.client = ctx.connection.client;
  });

  teardown(async () => {
    await ctx.client?.close();
  });

  return ctx;
}
