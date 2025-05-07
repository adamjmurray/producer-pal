// device/mcp-server/add-tool-delete-clip.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");

function addToolDeleteClip(server, pendingRequests) {
  server.tool(
    "delete-clip",
    "Deletes a clip at the specified track and clip slot",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z.number().int().min(0).describe("Clip slot index (0-based)"),
    },
    async (args) => callLiveApi("delete-clip", args, pendingRequests)
  );
}

module.exports = { addToolDeleteClip };
