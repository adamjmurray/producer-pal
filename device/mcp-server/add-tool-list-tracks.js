// device/mcp-server/add-tool-list-tracks.js
const { callLiveApi } = require("./call-live-api.js");

function addToolListTracks(server, pendingRequests) {
  server.tool("list-tracks", "Lists all tracks and their clips in the Live session view", {}, async () =>
    callLiveApi("list-tracks", {}, pendingRequests)
  );
}

module.exports = { addToolListTracks };
