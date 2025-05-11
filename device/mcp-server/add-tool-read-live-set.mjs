// device/mcp-server/add-tool-read-live-set.mjs
import { callLiveApi } from "./call-live-api.mjs";

export function addToolReadLiveSet(server, pendingRequests) {
  server.tool(
    "read-live-set",
    "Returns comprehensive information about the Live Set including global settings and all tracks",
    {},
    async () => callLiveApi("read-live-set", {}, pendingRequests)
  );
}
