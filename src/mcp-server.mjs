// src/mcp-server.mjs
// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { createExpressApp } from "./mcp-server/create-express-app.mjs";

const now = () => new Date().toLocaleString("sv-SE"); // YYYY-MM-DD HH:mm:ss

const appServer = createExpressApp();

const PORT = 3000;
appServer
  .listen(PORT, () => {
    Max.post(`[${now()}] MCP Server running at http://localhost:${PORT}/mcp`);
  })
  .on("error", (error) => {
    throw new Error(error.code === "EADDRINUSE" ? `Port ${PORT} is already in use.` : `Server error: ${error}`);
  });
