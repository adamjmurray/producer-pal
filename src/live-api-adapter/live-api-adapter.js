// Entry point for the tool implementations with direct Live API access
import "./live-api-extensions.js";

import { toCompactJSLiteral } from "#src/shared/compact-serializer.js";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "#src/shared/mcp-response-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import { VERSION } from "#src/shared/version.js";
import { createClip } from "#src/tools/clip/create/create-clip.js";
import { readClip } from "#src/tools/clip/read/read-clip.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";
import { playback } from "#src/tools/control/playback.js";
import { rawLiveApi } from "#src/tools/control/raw-live-api.js";
import { select } from "#src/tools/control/select.js";
import { createDevice } from "#src/tools/device/create/create-device.js";
import { readDevice } from "#src/tools/device/read-device.js";
import { updateDevice } from "#src/tools/device/update/update-device.js";
import { readLiveSet } from "#src/tools/live-set/read-live-set.js";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.js";
import { deleteObject } from "#src/tools/operations/delete/delete.js";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.js";
import { readSamples } from "#src/tools/samples/read-samples.js";
import { createScene } from "#src/tools/scene/create-scene.js";
import { readScene } from "#src/tools/scene/read-scene.js";
import { updateScene } from "#src/tools/scene/update-scene.js";
import { createTrack } from "#src/tools/track/create/create-track.js";
import { readTrack } from "#src/tools/track/read/read-track.js";
import { updateTrack } from "#src/tools/track/update/update-track.js";
import { connect } from "#src/tools/workflow/connect.js";
import { memory } from "#src/tools/workflow/memory.js";

/**
 * @type {{
 *   projectNotes: { enabled: boolean; writable: boolean; content: string };
 *   smallModelMode: boolean;
 *   sampleFolder: string | null;
 *   holdingAreaStartBeats?: number;
 * }}
 */
const context = {
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
function initHoldingArea() {
  const liveSet = LiveAPI.from("live_set");

  context.holdingAreaStartBeats = /** @type {number} */ (
    liveSet.get("song_length")[0]
  );
}

/*
**IMPORTANT**: Always pass args AND context to tool functions
Use the `(args) => toolFunction(args, context)` pattern
This ensures all tools have access to context (holdingAreaStartBeats, silenceWavPath, etc.)
*/
/** @type {Record<string, (args: unknown) => unknown>} */
const tools = {
  "ppal-connect": (args) => connect(/** @type {any} */ (args), context),
  "ppal-read-live-set": (args) =>
    readLiveSet(/** @type {any} */ (args), context),
  "ppal-update-live-set": (args) =>
    updateLiveSet(/** @type {any} */ (args), context),
  "ppal-create-track": (args) =>
    createTrack(/** @type {any} */ (args), context),
  "ppal-read-track": (args) => readTrack(/** @type {any} */ (args), context),
  "ppal-update-track": (args) =>
    updateTrack(/** @type {any} */ (args), context),
  "ppal-create-scene": (args) =>
    createScene(/** @type {any} */ (args), context),
  "ppal-read-scene": (args) => readScene(/** @type {any} */ (args), context),
  "ppal-update-scene": (args) =>
    updateScene(/** @type {any} */ (args), context),
  "ppal-create-clip": (args) => createClip(/** @type {any} */ (args), context),
  "ppal-read-clip": (args) => readClip(/** @type {any} */ (args), context),
  "ppal-update-clip": (args) => {
    initHoldingArea();

    return updateClip(/** @type {any} */ (args), context);
  },
  "ppal-transform-clips": (args) => {
    initHoldingArea();

    return transformClips(/** @type {any} */ (args), context);
  },
  "ppal-create-device": (args) =>
    createDevice(/** @type {any} */ (args), context),
  "ppal-read-device": (args) => readDevice(/** @type {any} */ (args), context),
  "ppal-update-device": (args) =>
    updateDevice(/** @type {any} */ (args), context),
  "ppal-playback": (args) => playback(/** @type {any} */ (args), context),
  "ppal-select": (args) => select(/** @type {any} */ (args), context),
  "ppal-delete": (args) => deleteObject(/** @type {any} */ (args), context),
  "ppal-duplicate": (args) => {
    initHoldingArea();

    return duplicate(/** @type {any} */ (args), context);
  },
  "ppal-memory": (args) => memory(/** @type {any} */ (args), context),
  "ppal-read-samples": (args) =>
    readSamples(/** @type {any} */ (args), context),
};

if (process.env.ENABLE_RAW_LIVE_API === "true") {
  tools["ppal-raw-live-api"] = (args) =>
    rawLiveApi(/** @type {any} */ (args), context);
}

/**
 * Call a tool by name with the given arguments
 *
 * @param {string} toolName - Name of the tool to call
 * @param {object} args - Arguments to pass to the tool
 * @returns {unknown} Tool execution result
 */
function callTool(toolName, args) {
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  return tool(args);
}

let isCompactOutputEnabled = true;

/**
 * Enable or disable compact output format
 *
 * @param {boolean} enabled - Whether to enable compact output
 */
export function compactOutput(enabled) {
  isCompactOutputEnabled = Boolean(enabled);
}

/**
 * Enable or disable small model mode
 *
 * @param {boolean} enabled - Whether to enable small model mode
 */
export function smallModelMode(enabled) {
  context.smallModelMode = Boolean(enabled);
}

/**
 * Enable or disable project notes feature
 *
 * @param {boolean} enabled - Whether to enable project notes
 */
export function projectNotesEnabled(enabled) {
  context.projectNotes.enabled = Boolean(enabled);
}

/**
 * Set whether project notes are writable
 *
 * @param {boolean} writable - Whether project notes should be writable
 */
export function projectNotesWritable(writable) {
  context.projectNotes.writable = Boolean(writable);
}

/**
 * Set the project notes content
 *
 * @param {string} _text - Unused parameter (needed for integration with the Max patch)
 * @param {string} content - Project notes content
 */
export function projectNotes(_text, content) {
  context.projectNotes.content = content ?? "";
}

/**
 * Set the sample folder path
 *
 * @param {string} _text - Unused parameter (needed for integration with the Max patch)
 * @param {string} path - Sample folder path
 */
export function sampleFolder(_text, path) {
  context.sampleFolder = path || null;
}

/**
 * Send a response back to the MCP server
 *
 * @param {string} requestId - Request identifier
 * @param {object} result - Result object to send
 */
function sendResponse(requestId, result) {
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
 * @param {string} requestId - Request identifier
 * @param {string} tool - Tool name to execute
 * @param {string} argsJSON - JSON string of arguments
 * @param {string} contextJSON - JSON string of context
 */
export async function mcp_request(requestId, tool, argsJSON, contextJSON) {
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

        console.error(`Warning: Failed to parse contextJSON: ${message}`);
      }
    }

    try {
      // NOTE: toCompactJSLiteral() basically formats things as JS literal syntax with unquoted keys
      // Compare this to the old way of passing the JS object directly here,
      // which results in a JSON.stringify() call on the object inside formatSuccessResponse().
      // toCompactJSLiteral() doesn't save us a ton of tokens in most tools, so if we see any issues
      // with any LLMs, we can go back to omitting toCompactJSLiteral() here.
      const output = /** @type {object} */ (await callTool(tool, args));

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
