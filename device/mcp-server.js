// device/mcp-server.js
// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
const Max = require("max-api");
const { createExpressApp } = require("./mcp-server/create-express-app.js");

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

const appServer = createExpressApp();

const PORT = 3000;
appServer.listen(PORT, () => {
  Max.post(`[${now()}] MCP Server running at http://localhost:${PORT}/mcp`);
});
