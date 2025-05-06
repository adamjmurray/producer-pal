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
          "Musical notation string. Format: pitchClass+octave (C3 = middle C). " +
            "Pitch classes: C Db D Eb E F Gb G Ab A Bb B, alternately spelled as C C# D D# E F F# G G# A A# B. " +
            "Velocity: :vNN (0–127; default = 100), must be placed before duration. " +
            "Durations: quarter note is default, /N means 1/N of a quarter note, *N means N times a quarter note. N can be an integer or decimal. " +
            "Duration examples: C3 = quarter note, C3/2 = eighth, C3/4 = sixteenth, C3*2 = half, C3*4 = whole, C3*1.5 = dotted quarter. " +
            "Rests: R[optional *N or /N] (default rest duration = quarter rest, just like notes). " +
            "Chords: [C3 E3 G3] (group notes played together). " +
            "Chord velocity and duration modifiers: [C3 E3 G4:v50/2]:v127*2 = C3 and E3 get chord settings :v127*2 and G4 overrides them. " +
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
