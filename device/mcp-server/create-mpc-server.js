// device/mcp-server/create-mpc-server.js
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { addToolCreateClip } = require("./add-tool-create-clip.js");
const { addToolListTracks } = require("./add-tool-list-tracks.js");
const { addToolGetClip } = require("./add-tool-get-clip.js");

function createMcpServer(pendingRequests) {
  const server = new McpServer({
    name: "Ableton Live Composition Assistant",
    version: "1.0.0",
  });

  addToolCreateClip(server, pendingRequests);
  addToolListTracks(server, pendingRequests);
  addToolGetClip(server, pendingRequests);

  return server;
}

module.exports = { createMcpServer };
