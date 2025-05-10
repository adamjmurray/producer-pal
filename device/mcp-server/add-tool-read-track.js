// device/mcp-server/add-tool-read-track.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");

function addToolReadTrack(server, pendingRequests) {
  server.tool(
    "read-track",
    "Read comprehensive information about a track",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("read-track", args, pendingRequests)
  );
}

module.exports = { addToolReadTrack };
