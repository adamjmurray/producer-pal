// device/main.js
// Entry point for the tool implementations with direct Live API access

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss
post(`[${now()}] loading main.js...\n`);

require("./live-api-extensions.js");
const console = require("./console.js");
const { deleteClip } = require("./tool-delete-clip.js");
const { deleteTrack } = require("./tool-delete-track.js");
const { readClip } = require("./tool-read-clip.js");
const { readLiveSet } = require("./tool-read-live-set.js");
const { readScene } = require("./tool-read-scene.js");
const { writeScene } = require("./tool-write-scene.js");
const { readTrack } = require("./tool-read-track.js");
const { writeClip } = require("./tool-write-clip.js");
const { writeLiveSet } = require("./tool-write-live-set.js");
const { writeTrack } = require("./tool-write-track.js");

const tools = {
  "read-live-set": () => readLiveSet(),
  "write-live-set": (args) => writeLiveSet(args),
  "read-track": (args) => readTrack(args),
  "write-track": (args) => writeTrack(args),
  "delete-track": (args) => deleteTrack(args),
  "read-scene": (args) => readScene(args),
  "write-scene": (args) => writeScene(args),
  "read-clip": (args) => readClip(args),
  "write-clip": (args) => writeClip(args),
  "delete-clip": (args) => deleteClip(args),
};
// Route to appropriate function based on tool name
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
function mcp_request(serializedJSON) {
  try {
    // Parse incoming request
    const request = JSON.parse(serializedJSON);
    const { requestId, tool, args } = request;

    let result;

    try {
      result = formatSuccessResponse(callTool(tool, args));
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

console.log(`[${now()}] main.js loaded successfully`);
