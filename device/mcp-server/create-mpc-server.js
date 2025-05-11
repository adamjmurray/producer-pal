// device/mcp-server/create-mpc-server.js
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { addToolWriteClip } = require("./add-tool-write-clip.js");
const { addToolListTracks } = require("./add-tool-list-tracks.js");
const { addToolReadClip } = require("./add-tool-read-clip.js");
const { addToolReadTrack } = require("./add-tool-read-track.js");
const { addToolDeleteClip } = require("./add-tool-delete-clip.js");
const { addToolDeleteTrack } = require("./add-tool-delete-track.js");

function createMcpServer(pendingRequests) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolListTracks(server, pendingRequests);

  addToolReadTrack(server, pendingRequests);
  addToolDeleteTrack(server, pendingRequests);

  addToolReadClip(server, pendingRequests);
  addToolWriteClip(server, pendingRequests);
  addToolDeleteClip(server, pendingRequests);

  return server;
}

module.exports = { createMcpServer };
