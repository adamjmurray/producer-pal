// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

// Entry point for the tool implementations with direct Live API access
import "./live-api-extensions.ts";
import "#src/polyfills/es2023-array.ts";

import { toCompactJSLiteral } from "#src/shared/compact-serializer.ts";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "#src/shared/mcp-response-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { MIN_LIVE_VERSION, VERSION } from "#src/shared/version.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { playback } from "#src/tools/control/playback.ts";
import { rawLiveApi } from "#src/tools/control/raw-live-api.ts";
import { select } from "#src/tools/control/select.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { deleteObject } from "#src/tools/operations/delete/delete.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import { createScene } from "#src/tools/scene/create-scene.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import { connect } from "#src/tools/workflow/connect.ts";
import { context as contextTool } from "#src/tools/workflow/context.ts";
import { handleCodeExecResult } from "./code-exec-v8-protocol.ts";

// Configure 2 outlets: MCP responses (0) and warnings (1)
outlets = 2;
setoutletassist(0, "tool call results");
setoutletassist(1, "tool call warnings");

/**
 * Persistent session-scoped state set by the Max patch via setter messages.
 * This object is the single source of truth for memory/smallModelMode/
 * sampleFolder; per-request contexts snapshot from it.
 */
interface SessionState {
  memory: { enabled: boolean; writable: boolean; content: string };
  smallModelMode: boolean;
  sampleFolder: string | null;
}

const sessionState: SessionState = {
  memory: {
    enabled: false,
    writable: false,
    content: "",
  },
  smallModelMode: false,
  sampleFolder: null,
};

/**
 * Build a fresh per-request ToolContext that snapshots the persistent
 * session state and merges in request-scoped fields from the caller.
 * Concurrent in-flight requests get distinct contexts so a tool that
 * mutates its context can't leak state into another request.
 *
 * @param incoming - Per-request fields parsed from the contextJSON arg
 * @returns Fresh ToolContext owned by the calling request
 */
function buildRequestContext(incoming: Partial<ToolContext>): ToolContext {
  return {
    memory: { ...sessionState.memory },
    smallModelMode: sessionState.smallModelMode,
    sampleFolder: sessionState.sampleFolder,
    ...incoming,
  };
}

/**
 * Initialize holding area start position from current song_length on the
 * given per-request context. This ensures holding area is always just past
 * actual content, avoiding permanent song_length bloat from hardcoded
 * positions.
 *
 * @param ctx - Per-request context to populate
 */
function initHoldingArea(ctx: ToolContext): void {
  const liveSet = LiveAPI.from("live_set");

  ctx.holdingAreaStartBeats = liveSet.get("song_length")[0] as number;
}

/*
**IMPORTANT**: Always pass args AND ctx to tool functions
Use the `(args, ctx) => toolFunction(args, ctx)` pattern
This ensures all tools have access to context (holdingAreaStartBeats, silenceWavPath, etc.)
*/
/* eslint-disable @typescript-eslint/no-explicit-any -- tools use dynamic dispatch with any types */
const tools: Record<string, (args: unknown, ctx: ToolContext) => unknown> = {
  "ppal-connect": (args, ctx) => connect(args as any, ctx),
  "ppal-read-live-set": (args, ctx) => readLiveSet(args as any, ctx),
  "ppal-update-live-set": (args, ctx) => updateLiveSet(args as any, ctx),
  "ppal-create-track": (args, ctx) => createTrack(args as any, ctx),
  "ppal-read-track": (args, ctx) => readTrack(args as any, ctx),
  "ppal-update-track": (args, ctx) => updateTrack(args as any, ctx),
  "ppal-create-scene": (args, ctx) => createScene(args as any, ctx),
  "ppal-read-scene": (args, ctx) => readScene(args as any, ctx),
  "ppal-update-scene": (args, ctx) => updateScene(args as any, ctx),
  "ppal-create-clip": (args, ctx) => createClip(args as any, ctx),
  "ppal-read-clip": (args, ctx) => readClip(args as any, ctx),
  "ppal-update-clip": (args, ctx) => {
    initHoldingArea(ctx);

    return updateClip(args as any, ctx);
  },
  "ppal-create-device": (args, ctx) => createDevice(args as any, ctx),
  "ppal-read-device": (args, ctx) => readDevice(args as any, ctx),
  "ppal-update-device": (args, ctx) => updateDevice(args as any, ctx),
  "ppal-playback": (args, ctx) => playback(args as any, ctx),
  "ppal-select": (args, ctx) => select(args as any, ctx),
  "ppal-delete": (args, ctx) => deleteObject(args as any, ctx),
  "ppal-duplicate": (args, ctx) => {
    initHoldingArea(ctx);

    return duplicate(args as any, ctx);
  },
  "ppal-context": (args, ctx) => contextTool(args as any, ctx),
  "ppal-raw-live-api": (args, ctx) => rawLiveApi(args as any, ctx),
};
/* eslint-enable @typescript-eslint/no-explicit-any -- end of tools dispatch section */

/**
 * Call a tool by name with the given arguments and per-request context.
 *
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @param ctx - Per-request context for the tool
 * @returns Tool execution result
 */
function callTool(toolName: string, args: object, ctx: ToolContext): unknown {
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return tool(args, ctx);
}

let isCompactOutputEnabled = true;

/**
 * Enable or disable compact output format
 *
 * @param enabled - Whether to enable compact output
 */
export function compactOutput(enabled: unknown): void {
  isCompactOutputEnabled = Boolean(enabled);
}

/**
 * Enable or disable small model mode
 *
 * @param enabled - Whether to enable small model mode
 */
export function smallModelMode(enabled: unknown): void {
  sessionState.smallModelMode = Boolean(enabled);
}

/**
 * Enable or disable memory feature
 *
 * @param enabled - Whether to enable memory
 */
export function memoryEnabled(enabled: unknown): void {
  sessionState.memory.enabled = Boolean(enabled);
}

/**
 * Set whether memory is writable
 *
 * @param writable - Whether memory should be writable
 */
export function memoryWritable(writable: unknown): void {
  sessionState.memory.writable = Boolean(writable);
}

/**
 * Set the memory content
 *
 * @param content - Memory content
 */
export function memoryContent(content: unknown): void {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = content === "bang" ? "" : String(content ?? "");

  sessionState.memory.content = value;
}

/**
 * Set the sample folder path
 *
 * @param path - Sample folder path
 */
export function sampleFolder(path: unknown): void {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = path === "bang" ? "" : String(path ?? "");

  sessionState.sampleFolder = value;
}

/**
 * Send a response back to the MCP server
 *
 * @param requestId - Request identifier
 * @param result - Result object to send
 */
function sendResponse(requestId: string, result: object): void {
  const jsonString = JSON.stringify(result);

  // Calculate required chunks
  const totalChunks = Math.ceil(jsonString.length / MAX_CHUNK_SIZE);

  if (totalChunks > MAX_CHUNKS) {
    // Response too large - send error instead
    const errorResult = formatErrorResponse(
      `Response too large: ${jsonString.length} bytes would require ${totalChunks} chunks (max ${MAX_CHUNKS})`,
    );

    outlet(
      0,
      "mcp_response",
      requestId,
      JSON.stringify(errorResult),
      MAX_ERROR_DELIMITER,
    );

    return;
  }

  // Chunk the JSON string
  const chunks = [];

  for (let i = 0; i < jsonString.length; i += MAX_CHUNK_SIZE) {
    chunks.push(jsonString.slice(i, i + MAX_CHUNK_SIZE));
  }

  // Send as: ["mcp_response", requestId, chunk1, chunk2, ..., delimiter]
  outlet(0, "mcp_response", requestId, ...chunks, MAX_ERROR_DELIMITER);
}

/**
 * Handle code_exec_result message from Node after sandboxed code execution
 *
 * @param requestId - Request identifier
 * @param resultJson - JSON string of SandboxResult
 */
export function code_exec_result(requestId: string, resultJson: string): void {
  handleCodeExecResult(requestId, resultJson);
}

// Handle messages from Node for Max
/**
 * Handle MCP request from Node for Max
 *
 * @param requestId - Request identifier
 * @param tool - Tool name to execute
 * @param argsJSON - JSON string of arguments
 * @param contextJSON - JSON string of context
 */
export async function mcp_request(
  requestId: string,
  tool: string,
  argsJSON: string,
  contextJSON?: string | null,
): Promise<void> {
  let result;

  try {
    const args = JSON.parse(argsJSON) as Record<string, unknown>;

    // Build a fresh per-request context so concurrent in-flight requests
    // (possible whenever a tool awaits, e.g. code_exec) don't share state.
    let incomingContext: Partial<ToolContext> = {};

    if (contextJSON != null) {
      try {
        incomingContext = JSON.parse(contextJSON) as Partial<ToolContext>;
      } catch (contextError) {
        const message =
          contextError instanceof Error
            ? contextError.message
            : String(contextError);

        console.warn(`Failed to parse contextJSON: ${message}`);
      }
    }

    const requestContext = buildRequestContext(incomingContext);

    try {
      // NOTE: toCompactJSLiteral() basically formats things as JS literal syntax with unquoted keys
      // Compare this to the old way of passing the JS object directly here,
      // which results in a JSON.stringify() call on the object inside formatSuccessResponse().
      // toCompactJSLiteral() doesn't save us a ton of tokens in most tools, so if we see any issues
      // with any LLMs, we can go back to omitting toCompactJSLiteral() here.
      const output = (await callTool(tool, args, requestContext)) as object;

      result = formatSuccessResponse(
        isCompactOutputEnabled ? toCompactJSLiteral(output) : output,
      );
    } catch (toolError) {
      const message =
        toolError instanceof Error ? toolError.message : String(toolError);

      result = formatErrorResponse(
        `Error executing tool '${tool}': ${message}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    result = formatErrorResponse(`Error parsing tool call request: ${message}`);
  }

  // Send response back to Node for Max
  sendResponse(requestId, result);
}

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

console.log(`[${now()}] Producer Pal ${VERSION} Live API adapter ready`);

// send a "started" signal so UI controls can resync their values
// while changing the code repeatedly during development:
outlet(0, "started");

/**
 * Check the Live version meets the minimum requirement.
 * Called by the Max patch after the device is fully loaded (LiveAPI is not available at top-level).
 */
export function checkLiveVersion(): void {
  const liveVersion = LiveAPI.from("live_app").call(
    "get_version_string",
  ) as string;

  if (isNewerVersion(liveVersion, MIN_LIVE_VERSION)) {
    outlet(0, "min_live_version_not_met", liveVersion, MIN_LIVE_VERSION);
  }
}
