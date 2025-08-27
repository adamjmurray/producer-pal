// Entry point for the tool implementations with direct Live API access
import "./live-api-extensions";

import {
  formatErrorResponse,
  formatSuccessResponse,
  MAX_CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ERROR_DELIMITER,
} from "../shared/mcp-response-utils";
import * as console from "../shared/v8-max-console";
import { VERSION } from "../shared/version";
import { createClip } from "../tools/clip/create-clip";
import { readClip } from "../tools/clip/read-clip";
import { updateClip } from "../tools/clip/update-clip";
import { readDevice } from "../tools/device/read-device";
import { deleteObject } from "../tools/operations/delete";
import { duplicate } from "../tools/operations/duplicate";
import { init } from "../tools/operations/init";
import { memory } from "../tools/operations/memory";
import { rawLiveApi } from "../tools/operations/raw-live-api";
import { transport } from "../tools/operations/transport";
import { captureScene } from "../tools/scene/capture-scene";
import { createScene } from "../tools/scene/create-scene";
import { readScene } from "../tools/scene/read-scene";
import { updateScene } from "../tools/scene/update-scene";
import { readSong } from "../tools/song/read-song";
import { updateSong } from "../tools/song/update-song";
import { createTrack } from "../tools/track/create-track";
import { readTrack } from "../tools/track/read-track";
import { updateTrack } from "../tools/track/update-track";
import { readView } from "../tools/view/read-view";
import { updateView } from "../tools/view/update-view";

const userContext = {
  projectNotes: {
    enabled: false,
    writable: false,
    content: "",
  },
};

const tools = {
  "ppal-init": (args) => init(args, userContext),
  "ppal-read-song": (args) => readSong(args),
  "ppal-update-song": (args) => updateSong(args),
  "ppal-create-scene": (args) => createScene(args),
  "ppal-read-scene": (args) => readScene(args),
  "ppal-update-scene": (args) => updateScene(args),
  "ppal-create-track": (args) => createTrack(args),
  "ppal-read-track": (args) => readTrack(args),
  "ppal-update-track": (args) => updateTrack(args),
  "ppal-read-view": (args) => readView(args),
  "ppal-update-view": (args) => updateView(args),
  "ppal-create-clip": (args) => createClip(args),
  "ppal-read-clip": (args) => readClip(args),
  "ppal-read-device": (args) => readDevice(args),
  "ppal-update-clip": (args) => updateClip(args),
  "ppal-delete": (args) => deleteObject(args),
  "ppal-duplicate": (args) => duplicate(args),
  "ppal-capture-scene": (args) => captureScene(args),
  "ppal-transport": (args) => transport(args),
  "ppal-memory": (args) => memory(args, userContext),
};

if (process.env.ENABLE_RAW_LIVE_API === "true") {
  tools["ppal-raw-live-api"] = (args) => rawLiveApi(args);
}

function callTool(toolName, args) {
  const tool = tools[toolName];
  if (!tool) throw new Error(`Unknown tool: ${tool}`);
  return tool(args);
}

export function projectNotesEnabled(enabled) {
  userContext.projectNotes.enabled = !!enabled;
}

export function projectNotesWritable(writable) {
  userContext.projectNotes.writable = !!writable;
}

export function projectNotes(_text, content) {
  userContext.projectNotes.content = content ?? "";
}

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
export async function mcp_request(requestId, tool, argsJSON) {
  let result;
  try {
    const args = JSON.parse(argsJSON);

    const includeUserContext =
      userContext.projectNotes.enabled && tool === "ppal-read-song";

    try {
      // TODO: Get projectNotes behaviors under test coverage
      result = formatSuccessResponse({
        ...(await callTool(tool, args)),
        ...(includeUserContext ? { userContext } : {}),
      });
    } catch (toolError) {
      result = formatErrorResponse(
        `Internal error calling tool '${tool}': ${toolError.message} - Ableton Live is connected but the tool encountered an error.`,
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
