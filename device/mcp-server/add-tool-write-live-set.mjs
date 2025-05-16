// device/mcp-server/add-tool-write-live-set.mjs
import { z } from "zod";

export function addToolWriteLiveSet(server, callLiveApi) {
  server.tool(
    "write-live-set",
    "Updates Live Set properties like view state, tempo, and time signature",
    {
      tempo: z.number().min(20).max(999).optional().describe("Set tempo in BPM (20.0-999.0)"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4")'),
      view: z.enum(["Session", "Arranger"]).optional().describe("Switch between Session and Arranger views"),
    },
    async (args) => callLiveApi("write-live-set", args)
  );
}
