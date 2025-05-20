// src/mcp-server/add-tool-read-song.mjs

export function addToolReadSong(server, callLiveApi) {
  server.tool(
    "read-song",
    "Returns comprehensive information about the Live Set including global settings and all tracks",
    {},
    async () => callLiveApi("read-song", {})
  );
}
