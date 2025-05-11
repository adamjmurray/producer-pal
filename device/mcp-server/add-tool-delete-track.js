// device/mcp-server/add-tool-delete-track.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");

function addToolDeleteTrack(server, pendingRequests) {
  server.tool(
    "delete-track",
    "Deletes a track at the specified index",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("delete-track", args, pendingRequests)
  );
}

module.exports = { addToolDeleteTrack };
