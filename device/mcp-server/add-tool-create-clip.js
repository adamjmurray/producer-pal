// device/mcp-server/add-tool-create-clip.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");
const { TONE_LANG_DESCRIPTION } = require("./tone-lang-description.js");

function addToolCreateClip(server, pendingRequests) {
  server.tool(
    "create-clip",
    "Creates a non-looping MIDI clip with optional notes at the specified track and clip slot",
    {
      track: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
      name: z.string().optional().describe("Optional name for the clip"),
      color: z.string().optional().describe("Optional color in #RRGGBB hex format"),
      notes: z.string().optional().describe(`Musical notation in ToneLang format. ${TONE_LANG_DESCRIPTION}`),
      loop: z.boolean().default(false).describe("Enabling looping for the clip"),
      autoplay: z.boolean().default(false).describe("Automatically play the clip after creating it"),
      onExistingClip: z
        .enum(["error", "replace", "merge"])
        .default("error")
        .describe("How to handle an existing clip: 'error' (default), 'replace', or 'merge'"),
    },
    async (args) => callLiveApi("create-clip", args, pendingRequests)
  );
}

module.exports = { addToolCreateClip };
