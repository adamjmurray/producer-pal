// device/mcp-server/add-tool-write-live-set.mjs
import { z } from "zod";

export function addToolWriteLiveSet(server, callLiveApi) {
  server.tool(
    "write-live-set",
    "Updates Live Set properties like transport state, tempo, and time signature",
    {
      isPlaying: z.boolean().optional().describe("Start/stop transport"),
      tempo: z.number().min(20).max(999).optional().describe("Set tempo in BPM (20.0-999.0)"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4")'),
      stopAllClips: z.boolean().default(false).describe("Stop all clips in the Live Set"),
      view: z.enum(["Session", "Arranger"]).optional().describe("Switch between Session and Arranger views"),
      followsArranger: z
        .boolean()
        .default(false)
        .describe("When true, stops all Session clips and follow clips in the Arranger"),
    },
    async (args) => callLiveApi("write-live-set", args)
  );
}
