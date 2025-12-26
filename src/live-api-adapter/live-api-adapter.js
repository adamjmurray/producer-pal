// Entry point for the tool implementations with direct Live API access
import "./live-api-extensions.js";

import { toCompactJSLiteral } from "../shared/compact-serializer.js";
import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "../shared/mcp-response-utils.js";
import * as console from "../shared/v8-max-console.js";
import { VERSION } from "../shared/version.js";
import { createClip } from "../tools/clip/create/create-clip.js";
import { readClip } from "../tools/clip/read/read-clip.js";
import { updateClip } from "../tools/clip/update/update-clip.js";
import { playback } from "../tools/control/playback.js";
import { rawLiveApi } from "../tools/control/raw-live-api.js";
import { select } from "../tools/control/select.js";
import { createDevice } from "../tools/device/create/create-device.js";
import { readDevice } from "../tools/device/read-device.js";
import { updateDevice } from "../tools/device/update/update-device.js";
import { readLiveSet } from "../tools/live-set/read-live-set.js";
import { updateLiveSet } from "../tools/live-set/update-live-set.js";
import { deleteObject } from "../tools/operations/delete/delete.js";
import { duplicate } from "../tools/operations/duplicate/duplicate.js";
import { transformClips } from "../tools/operations/transform-clips/transform-clips.js";
import { readSamples } from "../tools/samples/read-samples.js";
import { createScene } from "../tools/scene/create-scene.js";
import { readScene } from "../tools/scene/read-scene.js";
import { updateScene } from "../tools/scene/update-scene.js";
import { createTrack } from "../tools/track/create/create-track.js";
import { readTrack } from "../tools/track/read/read-track.js";
import { updateTrack } from "../tools/track/update/update-track.js";
import { connect } from "../tools/workflow/connect.js";
import { memory } from "../tools/workflow/memory.js";

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
  const liveSet = new LiveAPI("live_set");

  context.holdingAreaStartBeats = liveSet.get("song_length")[0];
}

/*
**IMPORTANT**: Always pass args AND context to tool functions
Use the `(args) => toolFunction(args, context)` pattern
This ensures all tools have access to context (holdingAreaStartBeats, silenceWavPath, etc.)
*/
const tools = {
  "ppal-connect": (args) => connect(args, context),
  "ppal-read-live-set": (args) => readLiveSet(args, context),
  "ppal-update-live-set": (args) => updateLiveSet(args, context),
  "ppal-create-track": (args) => createTrack(args, context),
  "ppal-read-track": (args) => readTrack(args, context),
  "ppal-update-track": (args) => updateTrack(args, context),
  "ppal-create-scene": (args) => createScene(args, context),
  "ppal-read-scene": (args) => readScene(args, context),
  "ppal-update-scene": (args) => updateScene(args, context),
  "ppal-create-clip": (args) => createClip(args, context),
  "ppal-read-clip": (args) => readClip(args, context),
  "ppal-update-clip": (args) => {
    initHoldingArea();

    return updateClip(args, context);
  },
  "ppal-transform-clips": (args) => {
    initHoldingArea();

    return transformClips(args, context);
  },
  "ppal-create-device": (args) => createDevice(args, context),
  "ppal-read-device": (args) => readDevice(args, context),
  "ppal-update-device": (args) => updateDevice(args, context),
  "ppal-playback": (args) => playback(args, context),
  "ppal-select": (args) => select(args, context),
  "ppal-delete": (args) => deleteObject(args, context),
  "ppal-duplicate": (args) => {
    initHoldingArea();

    return duplicate(args, context);
  },
  "ppal-memory": (args) => memory(args, context),
  "ppal-read-samples": (args) => readSamples(args, context),
};

if (process.env.ENABLE_RAW_LIVE_API === "true") {
  tools["ppal-raw-live-api"] = (args) => rawLiveApi(args, context);
}

/**
 * Call a tool by name with the given arguments
 *
 * @param {string} toolName - Name of the tool to call
 * @param {object} args - Arguments to pass to the tool
 * @returns {object} Tool execution result
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
        console.error(
          `Warning: Failed to parse contextJSON: ${contextError.message}`,
        );
      }
    }

    try {
      // NOTE: toCompactJSLiteral() basically formats things as JS literal syntax with unquoted keys
      // Compare this to the old way of passing the JS object directly here,
      // which results in a JSON.stringify() call on the object inside formatSuccessResponse().
      // toCompactJSLiteral() doesn't save us a ton of tokens in most tools, so if we see any issues
      // with any LLMs, we can go back to omitting toCompactJSLiteral() here.
      const output = await callTool(tool, args);

      result = formatSuccessResponse(
        isCompactOutputEnabled ? toCompactJSLiteral(output) : output,
      );
    } catch (toolError) {
      result = formatErrorResponse(
        `Error executing tool '${tool}': ${toolError.message}`,
      );
    }
  } catch (error) {
    result = formatErrorResponse(
      `Error parsing tool call request: ${error.message}`,
    );
  }

  // Send response back to Node for Max
  sendResponse(requestId, result);
}

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

console.log(`[${now()}] Producer Pal ${VERSION} Live API adapter ready`);

// send a "started" signal so UI controls can resync their values
// while changing the code repeatedly during development:
outlet(0, "started");
