import { z } from "zod";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefCreateDevice = defineTool("ppal-create-device", {
  title: "Create Device",
  description: `Create a native Live device (instrument, MIDI effect, or audio effect) on a track`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based track index (required when creating a device)"),
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
  },
});
