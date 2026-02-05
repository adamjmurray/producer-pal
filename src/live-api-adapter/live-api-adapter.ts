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
import { VERSION } from "#src/shared/version.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { playback } from "#src/tools/control/playback.ts";
import { rawLiveApi } from "#src/tools/control/raw-live-api.ts";
import { select } from "#src/tools/control/select.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { readDevice } from "#src/tools/device/read-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { deleteObject } from "#src/tools/operations/delete/delete.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.ts";
import { readSamples } from "#src/tools/samples/read-samples.ts";
import { createScene } from "#src/tools/scene/create-scene.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { createTrack } from "#src/tools/track/create/create-track.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import { connect } from "#src/tools/workflow/connect.ts";
import { memory } from "#src/tools/workflow/memory.ts";

// Configure 2 outlets: MCP responses (0) and warnings (1)
outlets = 2;
setoutletassist(0, "tool call results");
setoutletassist(1, "tool call warnings");

const context: ToolContext = {
  projectNotes: {
    enabled: false,
    writable: false,
    content: "",
  },
  smallModelMode: false,
  sampleFolder: null,
};

/**
 * Initialize holding area start position from current song_length.
 * Called at the start of tools that use holding area operations.
 * This ensures holding area is always just past actual content,
 * avoiding permanent song_length bloat from hardcoded positions.
 */
function initHoldingArea(): void {
  const liveSet = LiveAPI.from("live_set");

  context.holdingAreaStartBeats = liveSet.get("song_length")[0] as number;
}

/*
**IMPORTANT**: Always pass args AND context to tool functions
Use the `(args) => toolFunction(args, context)` pattern
This ensures all tools have access to context (holdingAreaStartBeats, silenceWavPath, etc.)
*/
/* eslint-disable @typescript-eslint/no-explicit-any -- tools use dynamic dispatch with any types */
const tools: Record<string, (args: unknown) => unknown> = {
  "ppal-connect": (args) => connect(args as any, context),
  "ppal-read-live-set": (args) => readLiveSet(args as any, context),
  "ppal-update-live-set": (args) => updateLiveSet(args as any, context),
  "ppal-create-track": (args) => createTrack(args as any, context),
  "ppal-read-track": (args) => readTrack(args as any, context),
  "ppal-update-track": (args) => updateTrack(args as any, context),
  "ppal-create-scene": (args) => createScene(args as any, context),
  "ppal-read-scene": (args) => readScene(args as any, context),
  "ppal-update-scene": (args) => updateScene(args as any, context),
  "ppal-create-clip": (args) => createClip(args as any, context),
  "ppal-read-clip": (args) => readClip(args as any, context),
  "ppal-update-clip": (args) => {
    initHoldingArea();

    return updateClip(args as any, context);
  },
  "ppal-transform-clips": (args) => {
    initHoldingArea();

    return transformClips(args as any, context);
  },
  "ppal-create-device": (args) => createDevice(args as any, context),
  "ppal-read-device": (args) => readDevice(args as any, context),
  "ppal-update-device": (args) => updateDevice(args as any, context),
  "ppal-playback": (args) => playback(args as any, context),
  "ppal-select": (args) => select(args as any, context),
  "ppal-delete": (args) => deleteObject(args as any, context),
  "ppal-duplicate": (args) => {
    initHoldingArea();

    return duplicate(args as any, context);
  },
  "ppal-memory": (args) => memory(args as any, context),
  "ppal-read-samples": (args) => readSamples(args as any, context),
};

if (process.env.ENABLE_RAW_LIVE_API === "true") {
  tools["ppal-raw-live-api"] = (args) => rawLiveApi(args as any, context);
}
/* eslint-enable @typescript-eslint/no-explicit-any -- end of tools dispatch section */

/**
 * Call a tool by name with the given arguments
 *
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @returns Tool execution result
 */
function callTool(toolName: string, args: object): unknown {
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return tool(args);
}

let isCompactOutputEnabled = true;

/**
 * Enable or disable compact output format
 *
 * @param enabled - Whether to enable compact output
 */
export function compactOutput(enabled: unknown): void {
  // console.log(`Setting isCompactOutputEnabled ${Boolean(enabled)}`);
  isCompactOutputEnabled = Boolean(enabled);
}

/**
 * Enable or disable small model mode
 *
 * @param enabled - Whether to enable small model mode
 */
export function smallModelMode(enabled: unknown): void {
  // console.log(`[v8] Setting smallModelMode ${Boolean(enabled)}`);
  context.smallModelMode = Boolean(enabled);
}

/**
 * Enable or disable project notes feature
 *
 * @param enabled - Whether to enable project notes
 */
export function projectNotesEnabled(enabled: unknown): void {
  // console.log(`[v8] Setting projectNotesEnabled ${Boolean(enabled)}`);
  context.projectNotes.enabled = Boolean(enabled);
}

/**
 * Set whether project notes are writable
 *
 * @param writable - Whether project notes should be writable
 */
export function projectNotesWritable(writable: unknown): void {
  // console.log(`[v8] Setting projectNotesWritable ${Boolean(writable)}`);
  context.projectNotes.writable = Boolean(writable);
}

/**
 * Set the project notes content
 *
 * @param content - Project notes content
 */
export function projectNotes(content: unknown): void {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = content === "bang" ? "" : String(content ?? "");

  // console.log(`[v8] Setting projectNotes "${value}"`);
  context.projectNotes.content = value;
}

/**
 * Set the sample folder path
 *
 * @param path - Sample folder path
 */
export function sampleFolder(path: unknown): void {
  // an idiosyncrasy of Max's textedit is it routes bang for empty string:
  const value = path === "bang" ? "" : String(path ?? "");

  // console.log(`[v8] Setting sampleFolder "${value}"`);
  context.sampleFolder = value;
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
    const args = JSON.parse(argsJSON);

    // Merge incoming context (if provided) into existing context
    if (contextJSON != null) {
      try {
        const incomingContext = JSON.parse(contextJSON);

        Object.assign(context, incomingContext);
      } catch (contextError) {
        const message =
          contextError instanceof Error
            ? contextError.message
            : String(contextError);

        console.warn(`Failed to parse contextJSON: ${message}`);
      }
    }

    try {
      // NOTE: toCompactJSLiteral() basically formats things as JS literal syntax with unquoted keys
      // Compare this to the old way of passing the JS object directly here,
      // which results in a JSON.stringify() call on the object inside formatSuccessResponse().
      // toCompactJSLiteral() doesn't save us a ton of tokens in most tools, so if we see any issues
      // with any LLMs, we can go back to omitting toCompactJSLiteral() here.
      const output = (await callTool(tool, args)) as object;

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
