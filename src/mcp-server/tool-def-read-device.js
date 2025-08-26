// src/mcp-server/tool-def-read-device.js
import { z } from "zod/v3";
import { DEVICE_TYPES } from "../tools/constants.js";
import { defineTool } from "./define-tool.js";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description:
    "Read information about a specific device by ID. Returns device properties including type, name, and structure. " +
    "For rack devices, can optionally include chains and drum pad mappings. " +
    `Device types include: ${DEVICE_TYPES.map((type) => `'${type}'`).join(", ")}. ` +
    "ENTITY STATES (for drum pads and rack chains): " +
    "When no 'state' property is present, the entity is active (normal state - playing or ready to play). " +
    "When present, 'state' can be: " +
    "'muted': Explicitly muted via UI button; " +
    "'muted-via-solo': Muted as side-effect of another entity being soloed; " +
    "'muted-also-via-solo': Both explicitly muted AND muted via solo (won't become active even if unmuted or other entity unsoloed); " +
    "'soloed': Explicitly soloed, causing others to be muted-via-solo.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    deviceId: z.string().describe("Device ID to read"),
    include: z
      .array(z.enum(["*", "chains", "drum-chains"]))
      .default(["chains"])
      .describe(
        "Array of data to include in the response. Available options: " +
          "'*' (include all available options), " +
          "'chains' (include chains in rack devices), " +
          "'drum-chains' (include drum pad chains and drum map for drum racks). " +
          "Default: ['chains'].",
      ),
  },
});
