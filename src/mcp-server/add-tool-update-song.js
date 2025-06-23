// src/mcp-server/add-tool-update-song.js
import { z } from "zod";
import { VALID_SCALE_NAMES } from "../tools/update-song.js";

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
      scale: z
        .enum(VALID_SCALE_NAMES)
        .optional()
        .describe("Scale name"),
      scaleEnabled: z
        .boolean()
        .optional()
        .describe("Enable/disable scale highlighting"),
    },
    async (args) => callLiveApi("update-song", args),
  );
}
