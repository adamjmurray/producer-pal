// device/mcp-server/add-tool-delete-clip.mjs
import { z } from "zod";
import { callLiveApi } from "./call-live-api.mjs";

export function addToolDeleteClip(server, pendingRequests) {
  server.tool(
    "delete-clip",
    "Deletes a clip at the specified track and clip slot",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z.number().int().min(0).describe("Clip slot index (0-based)"),
    },
    async (args) => callLiveApi("delete-clip", args, pendingRequests)
  );
}
