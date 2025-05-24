// src/mcp-server/add-tool-update-song.js
import { z } from "zod";

export function addToolUpdateSong(server, callLiveApi) {
  server.tool(
    "update-song",
    "Updates global song properties in the Live Set including view state, tempo, and time signature",
    {
      tempo: z.number().min(20).max(999).optional().describe("Set tempo in BPM (20.0-999.0)"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4")'),
      view: z.enum(["Session", "Arranger"]).optional().describe("Switch between Session and Arranger views"),
    },
    async (args) => callLiveApi("update-song", args)
  );
}
