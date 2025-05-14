// device/mcp-server/add-tool-delete-clip.mjs
import { z } from "zod";

export function addToolDeleteClip(server, callLiveApi) {
  server.tool(
    "delete-clip",
    "Deletes a clip by id. The clip can be in Session view or Arranger view.",
    {
      id: z.string().describe("The id of the clip to delete"),
    },
    async (args) => callLiveApi("delete-clip", args)
  );
}
