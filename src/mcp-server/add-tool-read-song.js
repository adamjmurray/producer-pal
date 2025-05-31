// src/mcp-server/add-tool-read-song.js

export function addToolReadSong(server, callLiveApi) {
  server.tool(
    "read-song",
    "Read comprehensive information about the Live Set (via Ableton Producer Pal) including global settings and all tracks. Track objects include clip arrays with time-based properties in bar:beat format.",
    {},
    async () => callLiveApi("read-song", {})
  );
}
