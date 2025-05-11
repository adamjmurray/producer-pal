// device/mcp-server/add-tool-list-tracks.mjs
import { callLiveApi } from "./call-live-api.mjs";

export function addToolListTracks(server, pendingRequests) {
  server.tool("list-tracks", "Lists all tracks and their clips in the Live session view", {}, async () =>
    callLiveApi("list-tracks", {}, pendingRequests)
  );
}
