// src/mcp-server/add-tool-read-song.js

export function addToolReadSong(server, callLiveApi) {
  server.tool(
    "read-song",
    "Read comprehensive information about the Live Set (via Ableton Producer Pal) including global settings and all tracks. " +
      "Track objects include clip arrays with time-based properties in bar|beat format. " +
      "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback. " +
      "If the user asks to play with Ableton Live, start here and call this automatically.",
    {},
    async () => callLiveApi("read-song", {}),
  );
}
