// device/v8.js
// The tool implementations with direct Live API access
const { createClip } = require("create-clip");
const { listTracks } = require("list-tracks");

const toString = (any) => {
  const s = String(any);
  return s.includes("[object Object]") ? JSON.stringify(any) : s;
};
const log = (...any) => post(...any.map(toString), "\n");
const error = (...any) => globalThis.error(...any.map(toString), "\n");
log("----------------- v8.js reloaded ---------------------,\n", new Date());

// Handle messages from Node for Max
function mcp_request(serializedJSON) {
  try {
    // Parse incoming request
    const request = JSON.parse(serializedJSON);
    const { requestId, tool, args } = request;

    let result;

    // Route to appropriate function based on tool name
    switch (tool) {
      case "create-clip":
        result = createClip(args.track, args.clipSlot, args.notes, args.duration);
        break;
      case "list-tracks":
        result = listTracks();
        break;
      default:
        result = {
          success: false,
          message: `Unknown tool: ${tool}`,
        };
    }

    // Send response back to Node for Max
    const response = {
      requestId,
      result,
    };

    // Output the response as JSON
    outlet(0, "mcp_response", JSON.stringify(response));
  } catch (error) {
    outlet(
      0,
      "mcp_response",
      JSON.stringify({
        requestId: -1,
        result: {
          success: false,
          message: `Error processing request: ${error.message}`,
          error: error.toString(),
        },
      })
    );
  }
}
