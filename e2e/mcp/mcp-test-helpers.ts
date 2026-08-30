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
 * A generated eight-bar 4/4 drum loop — 441000 frames at 22050 Hz is exactly 32
 * beats at 96 BPM, the arrangement-sections tempo. DRUM_LOOP_FILE is one bar, so
 * a clip built from it still cannot cross a bar line; anything that needs a
 * multi-bar audio region (splitting, cropping) uses this against that Set.
 */
export const DRUM_LOOP_8BAR_FILE = resolve(
  __dirname,
  "../live-sets/samples/drum-loop-8bar.wav",
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
 * The LiveAPI object counter rides the same warning channel, and a build made
 * with ENABLE_BUILD_STATS attaches one to every response. It is instrumentation,
 * not something a tool is telling us, so it never counts as a tool warning —
 * otherwise measuring against real Live would fail this whole suite on the first
 * parseToolResult(). See dev/Development-Tools.md.
 */
const BUILD_STATS_WARNING = "WARNING: LiveAPI stats:";

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
    .filter(
      (item) =>
        item.type === "text" &&
        item.text?.startsWith("WARNING:") &&
        !item.text.startsWith(BUILD_STATS_WARNING),
    )
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

/**
 * Parse a result from a call that used a param alias, asserting the tool both
 * honored it and named the real param.
 *
 * Aliases exist for the names a model reaches for unprompted, so they are worth
 * one live check each — folded into a test that already reads the same object
 * the canonical way, rather than a suite of its own.
 * @param result - Raw tool result
 * @param toolName - Tool that was called
 * @param alias - The alias param the call used
 * @param canonical - The param it folds onto
 * @returns The parsed result
 */
export function parseAliasedToolResult<T>(
  result: unknown,
  toolName: string,
  alias: string,
  canonical: string,
): T {
  const { data, warnings } = parseToolResultWithWarnings<T>(result);

  expect(warnings).toStrictEqual([
    `WARNING: ${toolName} accepts "${alias}" as a fallback; the parameter is "${canonical}"`,
  ]);

  return data;
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

    // The reset below is a beforeEach, so it runs after any beforeAll in the
    // test file — a tool call from there would get the compact output format
    // and fail to parse as JSON. Reset here too so that can't happen. Only
    // needed under `once`: otherwise there is no client yet in a beforeAll.
    if (options?.once) {
      await resetConfigAndSettle();
    }
  });

  // Always reset config before each test (even when reusing connection)
  beforeEach(resetConfigAndSettle);

  teardown(async () => {
    await ctx.client?.close();
  });

  return ctx;
}

/**
 * Reset the server config and give Max time to process the message.
 * @returns Nothing
 */
async function resetConfigAndSettle(): Promise<void> {
  await resetConfig();
  await sleep(50);
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
  return (await createDevice(client, deviceName, path)).id;
}

/**
 * Creates a device and returns the path it actually landed at.
 *
 * Use this whenever a later step addresses the device — never hardcode `d0`,
 * `d1`, … A machine with default track presets starts every new track with
 * devices already on it, so device indices are not portable between machines.
 *
 * @param client - Connected MCP client
 * @param deviceName - Device to create
 * @param path - Container to create it in (e.g. `t3`, `t3/d0/c0`)
 * @returns The new device's path (e.g. `t3/d2`)
 */
export async function createTestDeviceAt(
  client: Client,
  deviceName: string,
  path: string,
): Promise<string> {
  return createdDevice(path, await createDevice(client, deviceName, path)).path;
}

export interface CreatedDevice {
  /** Producer Pal path to the device, e.g. `t3/d2` */
  path: string;
  /** The device's index in its container */
  deviceIndex: number;
}

/**
 * Where a just-created device landed.
 * @param containerPath - Container the device was created in
 * @param created - The create-device result
 * @returns The device's path and index
 */
function createdDevice(
  containerPath: string,
  created: CreateDeviceResult,
): CreatedDevice {
  if (created.deviceIndex == null) {
    throw new Error(`create-device gave no index for "${containerPath}"`);
  }

  return {
    path: `${containerPath}/d${created.deviceIndex}`,
    deviceIndex: created.deviceIndex,
  };
}

/**
 * Shared body for the createTestDevice* helpers.
 * @param client - Connected MCP client
 * @param deviceName - Device to create
 * @param path - Container to create it in
 * @returns The tool's parsed result
 */
async function createDevice(
  client: Client,
  deviceName: string,
  path: string,
): Promise<CreateDeviceResult> {
  const result = await client.callTool({
    name: "ppal-create-device",
    arguments: { deviceName, path },
  });
  const created = parseToolResult<CreateDeviceResult>(result);

  await sleep(100);

  return created;
}

/**
 * Count the devices on a track.
 *
 * Use this instead of assuming a track the test just made is empty — a default
 * track preset puts devices on every track Live creates, and that preset varies
 * per machine. Assert against this count, not a literal.
 *
 * @param client - Connected MCP client
 * @param trackIndex - Track to read
 * @returns How many devices the track holds
 */
export async function readDeviceCount(
  client: Client,
  trackIndex: number,
): Promise<number> {
  const track = parseToolResult<{ devices?: unknown[] }>(
    await client.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex, include: ["devices"] },
    }),
  );

  return track.devices?.length ?? 0;
}

/**
 * Creates a fresh MIDI track and waits for state to settle.
 * @param client - Connected MCP client
 * @returns The new track's index
 */
export async function createMidiTrack(client: Client): Promise<number> {
  const track = parseToolResult<{ trackIndex: number }>(
    await client.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi" },
    }),
  );

  await sleep(150);

  return track.trackIndex;
}

/**
 * Creates a Drum Rack at `path` with two populated pads (C1 = kick, D1 = the
 * generic sample) and waits for state to settle.
 * @param client - Connected MCP client
 * @param path - Container to create it in (e.g. `t3`, `t3/d0/c0`)
 * @returns Where the rack landed — never assume `d0`
 */
export async function createTwoPadDrumRack(
  client: Client,
  path: string,
): Promise<CreatedDevice> {
  const created = parseToolResult<CreateDeviceResult>(
    await client.callTool({
      name: "ppal-create-device",
      arguments: {
        deviceName: "Drum Rack",
        path,
        params: [
          { name: "pC1/d0/sample", value: KICK_FILE },
          { name: "pD1/d0/sample", value: SAMPLE_FILE },
        ],
      },
    }),
  );

  await sleep(200);

  return createdDevice(path, created);
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
    arguments: { id: clipId, include: ["notes"] },
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

/**
 * Ask Live which version it is, via ppal-connect.
 *
 * @param client - Connected MCP client
 * @returns The version string (e.g. "12.4.3")
 */
export async function readLiveVersion(client: Client): Promise<string> {
  const result = await client.callTool({ name: "ppal-connect", arguments: {} });

  return parseToolResult<{ abletonLiveVersion: string }>(result)
    .abletonLiveVersion;
}

/**
 * Whether this Live can load a sample into Simpler. Simpler's `replace_sample`
 * arrived in Live 12.4; on 12.3 a `sample` write warn-skips instead.
 *
 * @param client - Connected MCP client
 * @returns True on Live 12.4 and later
 */
export async function supportsSampleLoading(client: Client): Promise<boolean> {
  const [major = 0, minor = 0] = (await readLiveVersion(client))
    .split(".")
    .map(Number);

  return major > 12 || (major === 12 && minor >= 4);
}

/**
 * Whether the SERVED build has code execution compiled in. The flag is baked in
 * at build time (`build:debug` forces it on), so this process's own
 * ENABLE_CODE_EXEC says nothing about the device under test. `ppal-create-clip`
 * publishes its `code` param only when the feature is on, which makes the
 * published schema the honest signal.
 *
 * @param client - Connected MCP client
 * @returns True when the running device was built with code exec enabled
 */
export async function serverHasCodeExec(client: Client): Promise<boolean> {
  const { tools } = await client.listTools();
  const createClip = tools.find((tool) => tool.name === "ppal-create-clip");

  return createClip?.inputSchema.properties?.code != null;
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
  /** Where the clip landed: "t0/s3", "t0", or "t0/l1" */
  path?: string;
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
  /** Where the clip is: "t0/s3", "t0", or "t0/l1" */
  path?: string;
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
