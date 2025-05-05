// device/mcp-server/add-tool-create-clip.js
const { z } = require("zod");
const { callLiveApi } = require("./call-live-api.js");

function addToolCreateClip(server, pendingRequests) {
  server.tool(
    "create-clip",
    "Creates a non-looping MIDI clip with optional notes at the specified track and clip slot",
    {
      track: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
      name: z.string().optional().describe("Optional name for the clip"),
      color: z.string().optional().describe("Optional color in #RRGGBB hex format"),
      notes: z
        .string()
        .optional()
        .describe(
          "Musical notation string. Format: note+octave (C3 = middle C). " +
            "Durations: *N for longer, /N for shorter where N can be an integer or decimal (C3*2, C3*1.5, D3/2, D3/1.5; default = quarter note). " +
            "Rests: R[optional *N or /N] (default = quarter rest). " +
            "Velocity: :vNN (0–127; default = 100), placed before duration. " +
            "Chords: [C3 E3 G3] (group notes played together, share velocity and duration). " +
            "Examples: 'C3 D3:v80/2 [E3 G3]:v90*2', 'C3 R D3*4', '[F3 A3 C4]:v10', 'C3*1.5 D3/1.5' "
        ),
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
