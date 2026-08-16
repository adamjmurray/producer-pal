// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared test utilities for MCP e2e tests
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/mcp.ts";
import { openLiveSet } from "#evals/scenarios/open-live-set.ts";
import { type SkillOverrides } from "#src/skills/build-skills.ts";
import {
  CONFIG_URL,
  resetConfig,
  setConfig,
  type ConfigOptions,
} from "#evals/shared/config.ts";

// Re-export for use in tests
export { extractToolResultText };

// Re-export config utilities for use in tests
export { CONFIG_URL, resetConfig, setConfig, type ConfigOptions };

// Sample file for audio clip tests - resolve relative to this file's location
const __dirname = dirname(fileURLToPath(import.meta.url));

export const SAMPLE_FILE = resolve(
  __dirname,
  "../live-sets/samples/sample.aiff",
);

export const KICK_FILE = resolve(
  __dirname,
  "../live-sets/samples/drums/kick.aiff",
);

/**
 * A generated one-bar 4/4 drum loop at the test Set's tempo — 98000 frames at
 * 44100 Hz is exactly 4 beats at 108 BPM. SAMPLE_FILE is under a bar long, so
 * anything that needs a bar-aligned audio region uses this instead. See
 * live-sets/samples/generate-drum-loop.mjs.
 */
export const DRUM_LOOP_FILE = resolve(
  __dirname,
  "../live-sets/samples/drum-loop-1bar.wav",
);

/**
 * Parse a tool result as JSON with type casting.
 * Throws if the result contains unexpected warnings.
 * Use parseToolResultWithWarnings() for results where warnings are expected.
 * Requires jsonOutput: true in config (set by resetConfig).
 */
export function parseToolResult<T>(result: unknown): T {
  const warnings = getToolWarnings(result);

  if (warnings.length > 0) {
    throw new Error(
      `Unexpected warnings in tool result (use parseToolResultWithWarnings if expected): ${warnings.join(", ")}`,
    );
  }

  const text = extractToolResultText(result);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse JSON response. Raw text:", text);
    throw error;
  }
}

/**
 * Parse a batch create/update result and assert its shape. Every batch tool
 * answers with an array whatever it operates on, so the scene and track suites
 * share this check before their own per-domain assertions.
 * @param result - Raw tool result from a batch call
 * @param count - Expected number of items in the batch
 * @returns The parsed batch items
 */
export function parseBatchResult<T>(result: unknown, count: number): T[] {
  const batch = parseToolResult<T[]>(result);

  expect(Array.isArray(batch)).toBe(true);
  expect(batch).toHaveLength(count);

  return batch;
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

/**
 * Extract notices from a tool result — the "Warning: " channel the tool
 * framework itself writes to (deprecated params, ignored arguments), as opposed
 * to the "WARNING: " channel a tool handler writes to.
 */
export function getToolNotices(result: unknown): string[] {
  const typed = result as {
    content?: Array<{ text?: string; type?: string }>;
  } | null;

  if (!typed?.content) return [];

  return typed.content
    .filter((item) => item.type === "text" && item.text?.startsWith("Warning:"))
    .map((item) => item.text ?? "");
}

/**
 * Result from parsing a tool response, including any warnings.
 */
export interface ToolResultWithWarnings<T> {
  data: T;
  warnings: string[];
}

/**
 * Parse a tool result as JSON and extract any warnings.
 * Use this instead of parseToolResult() when warnings are expected.
 */
export function parseToolResultWithWarnings<T>(
  result: unknown,
): ToolResultWithWarnings<T> {
  const text = extractToolResultText(result);
  let data: T;

  try {
    data = JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse JSON response. Raw text:", text);
    throw error;
  }

  return { data, warnings: getToolWarnings(result) };
}

export const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";
export const LIVE_SET_PATH =
  "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Sleep for a specified number of milliseconds.
 * Useful for waiting for Live API state to settle.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
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
  /** Path to a Live Set to open instead of the default e2e-test-set */
  liveSetPath?: string;
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
    await openLiveSet(options?.liveSetPath ?? LIVE_SET_PATH);
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
  id: string;
  deviceIndex: number | null;
}

/**
 * Creates a device for testing and waits for state to settle.
 * Returns the device id as a string for use in subsequent assertions.
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

  return created.id;
}

/**
 * Reads a clip's notes back from Live and returns the parsed result.
 * The most common e2e read-back pattern, shared across clip test suites.
 */
export async function readClipWithNotes(
  client: Client,
  clipId: string,
): Promise<ReadClipResult> {
  const result = await client.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include: ["notes"] },
  });

  return parseToolResult<ReadClipResult>(result);
}

/**
 * The skills overrides the server under test will apply, read from its own
 * ~/.producer-pal via GET /skill-overrides.
 *
 * E2E deliberately runs against a config dir that is NOT inert (open-live-set.ts
 * strips VITEST before launching Live), so a developer with a saved override
 * gets a blob a bare `buildSkills()` can't reproduce. Pass this as its second
 * argument to expect what this machine actually serves. Reading it off the
 * server rather than the local disk also keeps a remote MCP_URL honest.
 *
 * Slot files only: a fork's own non-slot fragment (skills/my/frag.md) isn't
 * listed by this route, so a slot override that includes one still diverges.
 *
 * @returns Override bodies and disabled names, keyed by fragment include name
 */
export async function fetchSkillOverrides(): Promise<SkillOverrides> {
  const response = await fetch(MCP_URL.replace("/mcp", "/skill-overrides"));

  expect(response.ok).toBe(true);

  const { slots } = (await response.json()) as {
    slots: Array<{ name: string; override: string; enabled: boolean }>;
  };
  const fragments: Record<string, string> = {};
  const disabled: string[] = [];

  for (const slot of slots) {
    if (slot.override) fragments[slot.name] = slot.override;
    if (!slot.enabled) disabled.push(slot.name);
  }

  return { fragments, disabled };
}

// ============================================================================
// Shared Result Interfaces
// ============================================================================

/** Result from ppal-create-clip tool */
export interface CreateClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
  length?: string;
  /** Audio clips only: whether Live is time-stretching the sample */
  warping?: boolean;
}

/** Result from ppal-update-clip tool (single clip) */
export interface UpdateClipResult {
  id: string;
  noteCount?: number;
  transformed?: number;
}

/** Result from ppal-create-track tool */
export interface CreateTrackResult {
  id: string;
  trackIndex?: number;
}

/** Result from ppal-read-clip tool (comprehensive interface for all test cases) */
export interface ReadClipResult {
  id: string | null;
  type?: "midi" | "audio" | null;
  name?: string | null;
  view?: "session" | "arrangement";
  color?: string | null;
  timeSignature?: string | null;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  slot?: string;
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
  warpMarkers?: Array<{ sampleTime: number; beatTime: number }>;
  firstStart?: string;
  sampleFile?: string;
  sampleLength?: number;
  sampleRate?: number;
}
