const toString = (any) => {
  const s = String(any);
  return s.includes("[object Object]") ? JSON.stringify(any) : s;
};
const log = (...any) => post(...any.map(toString), "\n");
const error = (...any) => globalThis.error(...any.map(toString), "\n");
log("----------------- v8.js reloaded ---------------------,\n", new Date());

// Create-clip function using Live API
function createClip(trackIndex, clipSlotIndex) {
  try {
    // Get the clip slot from the Live API
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

    // Check if the clip slot already has a clip
    if (clipSlot.get("has_clip") == 0) {
      // Create a clip (4 beats long)
      clipSlot.call("create_clip", 4);

      return {
        content: [
          {
            type: "text",
            text: `Created empty clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error: Clip slot already has a clip at track ${trackIndex}, clip slot ${clipSlotIndex}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error creating clip: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

// Handle messages from Node for Max
function mcp_request(serializedJSON) {
  try {
    // Parse incoming request
    const request = JSON.parse(serializedJSON);
    const { requestId, tool, args } = request;

    let result;

    // Route to appropriate function based on tool name
    if (tool === "create-clip") {
      result = createClip(args.track, args.clipSlot);
    } else {
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
