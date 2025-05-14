// device/mcp-server/add-tool-delete-track.mjs
import { z } from "zod";

export function addToolDeleteTrack(server, callLiveApi) {
  server.tool(
    "delete-track",
    "Deletes a track by id",
    {
      id: z.string().describe("Track id to delete"),
    },
    async (args) => callLiveApi("delete-track", args)
  );
}
