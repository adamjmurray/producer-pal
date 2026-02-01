/**
 * Shared test utilities for MCP e2e tests
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/shared/mcp.ts";
import { openLiveSet } from "#evals/eval/open-live-set.ts";

// Re-export for use in tests
export { extractToolResultText };

// Sample file for audio clip tests - resolve relative to this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));

export const SAMPLE_FILE = resolve(
  __dirname,
  "../../evals/live-sets/samples/sample.aiff",
);

/**
 * Parse a tool result as JSON with type casting.
 * Requires jsonOutput: true in config (set by resetConfig).
 */
export function parseToolResult<T>(result: unknown): T {
  return JSON.parse(extractToolResultText(result)) as T;
}

/**
 * Check if a tool result is an error.
 */
export function isToolError(result: unknown): boolean {
  const typed = result as { isError?: boolean } | null;

  return typed?.isError === true;
}

/**
 * Extract error message from a tool error result.
 */
export function getToolErrorMessage(result: unknown): string {
  if (!isToolError(result)) {
    throw new Error("Expected tool result to be an error");
  }

  return extractToolResultText(result);
}

/**
 * Extract warning messages from a tool result.
 * Warnings are content items that start with "WARNING: ".
 */
export function getToolWarnings(result: unknown): string[] {
  const typed = result as {
    content?: Array<{ text?: string; type?: string }>;
  } | null;

  if (!typed?.content) return [];

  return typed.content
    .filter((item) => item.type === "text" && item.text?.startsWith("WARNING:"))
    .map((item) => item.text ?? "");
}

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
 * Reset server config to e2e test defaults:
 * - smallModelMode: false
 * - useProjectNotes: false
 * - projectNotes: ""
 * - projectNotesWritable: false
 * - jsonOutput: true (JSON output for easy parsing in tests)
 * - sampleFolder: ""
 */
export async function resetConfig(): Promise<void> {
  await setConfig({
    smallModelMode: false,
    useProjectNotes: false,
    projectNotes: "",
    projectNotesWritable: false,
    jsonOutput: true,
    sampleFolder: "",
  });
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

  // Always reset config before each test (even when reusing connection)
  beforeEach(async () => {
    await resetConfig();
    // Small delay to ensure Max processes the config message before test runs
    await sleep(50);
  });

  teardown(async () => {
    await ctx.client?.close();
  });

  return ctx;
}

interface CreateDeviceResult {
  deviceId: string | number;
  deviceIndex: number;
}

/**
 * Creates a device for testing and waits for state to settle.
 * Returns the deviceId as a string for use in subsequent assertions.
 */
export async function createTestDevice(
  client: Client,
  deviceName: string,
  path: string,
): Promise<string> {
  const result = await client.callTool({
    name: "ppal-create-device",
    arguments: { deviceName, path },
  });
  const created = parseToolResult<CreateDeviceResult>(result);

  await sleep(100);

  return String(created.deviceId);
}

// ============================================================================
// Shared Result Interfaces
// ============================================================================

/** Result from ppal-create-clip tool */
export interface CreateClipResult {
  id: string;
}

/** Result from ppal-create-track tool */
export interface CreateTrackResult {
  id: string;
  trackIndex?: number;
}

/** Result from ppal-read-clip tool (comprehensive interface for all test cases) */
export interface ReadClipResult {
  id: string | null;
  type: "midi" | "audio" | null;
  name?: string | null;
  view?: "session" | "arrangement";
  color?: string | null;
  timeSignature?: string | null;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  trackIndex?: number | null;
  sceneIndex?: number | null;
  arrangementStart?: string;
  arrangementLength?: string;
  noteCount?: number;
  notes?: string;
  // Audio clip properties
  gainDb?: number;
  pitchShift?: number;
  warping?: boolean;
  warpMode?: string;
}
