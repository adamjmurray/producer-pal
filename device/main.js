// device/main.js
// The tool implementations with direct Live API access

function localTimeStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    " " +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
post(`[${localTimeStamp()}] loading main.js...\n`);

const console = require("console");
const { createClip } = require("create-clip");
const { listTracks } = require("list-tracks");

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
      // Route to appropriate function based on tool name
      switch (tool) {
        case "create-clip":
          const clipResult = createClip(args);
          result = formatSuccessResponse(clipResult);
          break;
        case "list-tracks":
          const tracksResult = listTracks();
          result = formatSuccessResponse(tracksResult);
          break;
        default:
          throw new Error(`Unknown tool: ${tool}`);
      }
    } catch (toolError) {
      // Handle tool-specific errors
      result = formatErrorResponse(`Error in ${tool}: ${toolError.message}`);
    }

    // Send response back to Node for Max
    const response = {
      requestId,
      result,
    };

    // Output the response as JSON
    outlet(0, "mcp_response", JSON.stringify(response));
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

console.log(`[${localTimeStamp()}] main.js loaded successfully`);
