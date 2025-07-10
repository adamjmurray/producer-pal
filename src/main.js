// src/main.js
// Entry point for the tool implementations with direct Live API access

import * as console from "./console";
import "./live-api-extensions";
import { captureScene } from "./tools/capture-scene";
import { createClip } from "./tools/create-clip";
import { createScene } from "./tools/create-scene";
import { createTrack } from "./tools/create-track";
import { deleteObject } from "./tools/delete";
import { duplicate } from "./tools/duplicate";
import { rawLiveApi } from "./tools/raw-live-api";
import { readClip } from "./tools/read-clip";
import { readScene } from "./tools/read-scene";
import { readSong } from "./tools/read-song";
import { readTrack } from "./tools/read-track";
import { transport } from "./tools/transport";
import { updateClip } from "./tools/update-clip";
import { updateScene } from "./tools/update-scene";
import { updateSong } from "./tools/update-song";
import { updateTrack } from "./tools/update-track";

const context = {
  projectContext: {
    enabled: false,
    writable: false,
    contents: "",
  },
};

const tools = {
  "read-song": (args) => readSong(args),
  "update-song": (args) => updateSong(args),
  "create-scene": (args) => createScene(args),
  "read-scene": (args) => readScene(args),
  "update-scene": (args) => updateScene(args),
  "create-track": (args) => createTrack(args),
  "read-track": (args) => readTrack(args),
  "update-track": (args) => updateTrack(args),
  "create-clip": (args) => createClip(args),
  "read-clip": (args) => readClip(args),
  "update-clip": (args) => updateClip(args),
  delete: (args) => deleteObject(args),
  duplicate: (args) => duplicate(args),
  "capture-scene": (args) => captureScene(args),
  transport: (args) => transport(args),
};

if (process.env.ENABLE_RAW_LIVE_API === "true") {
  tools["raw-live-api"] = (args) => rawLiveApi(args);
}

function callTool(toolName, args) {
  const tool = tools[toolName];
  if (!tool) throw new Error(`Unknown tool: ${tool}`);
  return tool(args);
}

// Format a successful response with the standard MCP content structure
// non-string results will be JSON-stringified
function formatSuccessResponse(result) {
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  };
}

// Format an error response with the standard MCP error structure
function formatErrorResponse(errorMessage) {
  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };
}

export function projectContextEnabled(enabled) {
  context.projectContext.enabled = !!enabled;
}

export function projectContextWritable(writable) {
  context.projectContext.writable = !!writable;
}

export function projectContext(_text, contents) {
  context.projectContext.contents = contents ?? "";
}

// Handle messages from Node for Max
export async function mcp_request(serializedJSON) {
  try {
    // Parse incoming request
    const request = JSON.parse(serializedJSON);
    const { requestId, tool, args } = request;

    let result;

    try {
      // TODO: Get projectContext behaviors under test coverage
      result = formatSuccessResponse({
        ...(await callTool(tool, args)),
        ...(context.projectContext.enabled && tool === "read-song"
          ? { userContext: { projectContext: context.projectContext } }
          : {}),
      });
    } catch (toolError) {
      result = formatErrorResponse(`Error in ${tool}: ${toolError.message}`);
    }

    // Send response back to Node for Max
    outlet(
      0,
      "mcp_response",
      JSON.stringify({
        requestId,
        result,
      }),
    );
  } catch (error) {
    // Handle JSON parsing errors or other top-level errors
    outlet(
      0,
      "mcp_response",
      JSON.stringify({
        requestId: -1, // Use -1 when we don't know the original requestId
        result: formatErrorResponse(
          `Error processing request: ${error.message}`,
        ),
      }),
    );
  }
}

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

console.log(`[${now()}] main.js loaded successfully`);

// send a "started" signal so UI controls can resync their values
// while changing the code repeatedly during development:
outlet(0, "started");
