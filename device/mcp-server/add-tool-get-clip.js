// device/mcp-server/add-tool-get-clip.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");

function addToolGetClip(server, pendingRequests) {
  server.tool(
    "get-clip",
    "Retrieves clip information including notes. Returns type ('midi' or 'audio'), name, and length for all clips. " +
      "For MIDI clips, also returns noteCount and notes as a string (in the same musical syntax as the `create-clip` tool). " +
      "For audio clips, notes and noteCount are null. Returns null values for all fields when the clip slot is empty.",
    {
      track: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
    },
    async (args) => callLiveApi("get-clip", args, pendingRequests)
  );
}

module.exports = { addToolGetClip };
