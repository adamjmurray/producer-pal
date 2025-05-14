// device/mcp-server/add-tool-duplicate-clip-slot.mjs
import { z } from "zod";

export function addToolDuplicateClipSlot(server, callLiveApi) {
  server.tool(
    "duplicate-clip-slot",
    "Duplicates a clip slot at the specified position in a track. If a clip is in the slot after this one, it will be overwritten.",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z.number().int().min(0).describe("Clip slot index (0-based) to duplicate"),
      name: z.string().optional().describe("Optional name for the duplicated clip"),
    },
    async (args) => callLiveApi("duplicate-clip-slot", args)
  );
}
