// device/mcp-server/add-tool-duplicate-clip-to-arranger.mjs
import { z } from "zod";

export function addToolDuplicateClipToArranger(server, callLiveApi) {
  server.tool(
    "duplicate-clip-to-arranger",
    "Duplicates a clip from Session view to Arranger view in the same track at the specified start time",
    {
      clipId: z.string().describe("id of the clip to duplicate"),
      arrangerStartTime: z.number().describe("Start time in beats for the duplicated clip in Arranger view"),
    },
    async (args) => callLiveApi("duplicate-clip-to-arranger", args)
  );
}
