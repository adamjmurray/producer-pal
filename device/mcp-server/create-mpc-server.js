// device/mcp-server/create-mpc-server.js
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { addToolWriteClip } = require("./add-tool-write-clip.js");
const { addToolListTracks } = require("./add-tool-list-tracks.js");
const { addToolReadClip } = require("./add-tool-read-clip.js");
const { addToolDeleteClip } = require("./add-tool-delete-clip.js");

function createMcpServer(pendingRequests) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolWriteClip(server, pendingRequests);
  addToolListTracks(server, pendingRequests);
  addToolReadClip(server, pendingRequests);
  addToolDeleteClip(server, pendingRequests);

  return server;
}

module.exports = { createMcpServer };
