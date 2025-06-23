// src/mcp-server/add-tool-update-song.js
import { z } from "zod";

export function addToolUpdateSong(server, callLiveApi) {
  server.tool(
    "update-song",
    "Updates global song properties in the Live Set including view state, tempo, time signature, and key",
    {
      tempo: z
        .number()
        .min(20)
        .max(999)
        .optional()
        .describe("Set tempo in BPM (20.0-999.0)"),
      timeSignature: z
        .string()
        .optional()
        .describe('Time signature in format "n/m" (e.g. "4/4")'),
      view: z
        .enum(["session", "arrangement"])
        .optional()
        .describe("Switch between Session and Arrangement views"),
      rootNote: z
        .number()
        .int()
        .min(0)
        .max(11)
        .optional()
        .describe("Root note (0-11, where 0=C, 1=C#, 2=D, etc.)"),
      scaleName: z
        .enum([
          "Major",
          "Minor", 
          "Dorian",
          "Mixolydian",
          "Lydian",
          "Phrygian",
          "Locrian",
          "Whole Tone",
          "Half-whole Dim.",
          "Whole-half Dim.",
          "Minor Blues",
          "Minor Pentatonic",
          "Major Pentatonic",
          "Harmonic Minor",
          "Harmonic Major",
          "Dorian #4",
          "Phrygian Dominant",
          "Melodic Minor",
          "Lydian Augmented",
          "Lydian Dominant",
          "Super Locrian",
          "8-Tone Spanish",
          "Bhairav",
          "Hungarian Minor",
          "Hirajoshi",
          "In-Sen",
          "Iwato",
          "Kumoi",
          "Pelog Selisir",
          "Pelog Tembung",
          "Messiaen 3",
          "Messiaen 4",
          "Messiaen 5",
          "Messiaen 6",
          "Messiaen 7"
        ])
        .optional()
        .describe("Scale name"),
    },
    async (args) => callLiveApi("update-song", args),
  );
}
