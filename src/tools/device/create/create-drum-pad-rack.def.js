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

export const toolDefCreateDrumPadRack = defineTool("ppal-create-drum-pad-rack", {
  title: "Create nested rack on drum pad",
  description: "Create an Instrument Rack inside a Drum Rack pad with multiple chains and effects",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z.number().int().min(0).describe("Track index containing the drum rack"),
    drumRackDeviceIndex: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Device index of the drum rack on the track"),
    padNote: z
      .union([z.string(), z.number().int().min(0).max(127)])
      .default("C1")
      .describe("Pad note (e.g., C1 or MIDI number)"),
    layers: z.array(layerSchema).nonempty(),
    masterEffects: z.array(deviceName).default([]),
    clearExisting: z
      .boolean()
      .default(true)
      .describe("Whether to clear existing pad devices before inserting the rack"),
    macroCount: z
      .number()
      .int()
      .min(0)
      .max(16)
      .optional()
      .describe("Target macro count for the created pad Instrument Rack (rounded to even)"),
  },
});
