// src/main.js
// Entry point for the tool implementations with direct Live API access

import * as console from "./console";
import "./live-api-extensions";
import { captureScene } from "./tools/capture-scene";
import { deleteObject } from "./tools/delete";
import { duplicate } from "./tools/duplicate";
import { readClip } from "./tools/read-clip";
import { readScene } from "./tools/read-scene";
import { readSong } from "./tools/read-song";
import { readTrack } from "./tools/read-track";
import { transport } from "./tools/transport";
import { writeClip } from "./tools/write-clip";
import { writeScene } from "./tools/write-scene";
import { writeSong } from "./tools/write-song";
import { writeTrack } from "./tools/write-track";

const tools = {
  "read-song": () => readSong(),
  "write-song": (args) => writeSong(args),
  "read-scene": (args) => readScene(args),
  "write-scene": (args) => writeScene(args),
  "read-track": (args) => readTrack(args),
  "write-track": (args) => writeTrack(args),
  "read-clip": (args) => readClip(args),
  "write-clip": (args) => writeClip(args),
  delete: (args) => deleteObject(args),
  duplicate: (args) => duplicate(args),
  "capture-scene": (args) => captureScene(args),
  transport: (args) => transport(args),
};

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

// Handle messages from Node for Max
export async function mcp_request(serializedJSON) {
  try {
    // Parse incoming request
    const request = JSON.parse(serializedJSON);
    const { requestId, tool, args } = request;

    let result;

    try {
      result = formatSuccessResponse(await callTool(tool, args));
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
      })
    );
  } catch (error) {
    // Handle JSON parsing errors or other top-level errors
    outlet(
      0,
      "mcp_response",
      JSON.stringify({
        requestId: -1, // Use -1 when we don't know the original requestId
        result: formatErrorResponse(`Error processing request: ${error.message}`),
      })
    );
  }
}

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

console.log(`[${now()}] main.js loaded successfully`);
