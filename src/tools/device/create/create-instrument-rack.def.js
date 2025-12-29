import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";
import { VALID_DEVICES } from "../../constants.js";

const deviceName = z.enum([
  ...VALID_DEVICES.instruments,
  ...VALID_DEVICES.midiEffects,
  ...VALID_DEVICES.audioEffects,
]);

const sublayerSchema = z.object({
  name: z.string().optional(),
  instrument: deviceName.optional(),
  deviceName: deviceName.optional(),
  effects: z.array(deviceName).optional(),
});

const layerSchema = z.object({
  name: z.string().optional(),
  instrument: deviceName.optional(),
  deviceName: deviceName.optional(),
  effects: z.array(deviceName).optional(),
  sublayers: z.array(sublayerSchema).optional(),
  macroCount: z
    .number()
    .int()
    .min(0)
    .max(16)
    .optional()
    .describe("Target macro count for nested racks (rounded to even, max 16)"),
});

export const toolDefCreateInstrumentRack = defineTool("ppal-create-instrument-rack", {
  title: "Create instrument rack with layers",
  description: "Create an Instrument Rack on a track with layered chains, sublayers, macros, and effects",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackCategory: z
      .enum(["regular", "return", "master"])
      .default("regular")
      .describe("Track category where the rack will be created"),
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Track index (required for regular/return tracks, ignored for master)"),
    deviceIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Device index to insert the Instrument Rack at (default end of chain)"),
    rackName: z.string().optional().describe("Optional name for the created Instrument Rack"),
    layers: z.array(layerSchema).nonempty(),
    masterEffects: z.array(deviceName).default([]),
    macroCount: z
      .number()
      .int()
      .min(0)
      .max(16)
      .optional()
      .describe("Target macro count for the Instrument Rack (rounded to even)"),
  },
});
