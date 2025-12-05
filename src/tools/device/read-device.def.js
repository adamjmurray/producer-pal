import { z } from "zod";
import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description: "Read information about a specific device by ID.",
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
