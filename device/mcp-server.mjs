// device/mcp-server.mjs
// the entry point / loader script for the MCP server running inside Ableton Live via Node for Max
import Max from "max-api";
import { createExpressApp } from "./mcp-server/create-express-app.ts";

function localTimeStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    " " +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const appServer = createExpressApp();

const PORT = 3000;
appServer.listen(PORT, () => {
  Max.post(`[${localTimeStamp()}] MCP Server running at http://localhost:${PORT}/mcp`);
});
