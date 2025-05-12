// device/mcp-server/add-tool-read-clip.mjs
import { z } from "zod";
import { TONE_LANG_DESCRIPTION } from "./tone-lang-description.mjs";

export function addToolReadClip(server, callLiveApi) {
  server.tool(
    "read-clip",
    "Retrieves clip information including notes. Returns type ('midi' or 'audio'), name, and length for all clips. " +
      "For MIDI clips, also returns noteCount and notes as a string in ToneLang format. " +
      "For audio clips, notes and noteCount are null. Returns null values for all fields when the clip slot is empty.\n" +
      TONE_LANG_DESCRIPTION,
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z.number().int().min(0).describe("Clip slot index (0-based)"),
    },
    async (args) => callLiveApi("read-clip", args)
  );
}
