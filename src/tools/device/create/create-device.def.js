import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";

export const toolDefCreateDevice = defineTool("ppal-create-device", {
  title: "Create Device",
  description: `Create a native Live device (instrument, MIDI effect, or audio effect) on a track or inside a chain`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackCategory: z
      .enum(["regular", "return", "master"])
      .default("regular")
      .describe("regular/return tracks use trackIndex, master has no index"),
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based track index (required for regular/return tracks)"),
    deviceName: z
      .string()
      .optional()
      .describe("device name, omit to list available devices"),
    deviceIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("position in device chain, omit to append"),
    path: z
      .string()
      .optional()
      .describe(
        "device path (e.g., '0/0/0' to append to first rack chain, '0/0/0/1' for device index 1)",
      ),
  },
});
