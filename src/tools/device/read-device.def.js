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
      .array(z.enum(["*", "chains", "drum-chains", "params", "param-values"]))
      .default(["chains"])
      .describe(
        "Array of data to include. Options: " +
          "'*' (all), 'chains', 'drum-chains', " +
          "'params' (parameter names only: id, name), " +
          "'param-values' (full parameter details with values/metadata). " +
          "Default: ['chains'].",
      ),
    paramSearch: z
      .string()
      .optional()
      .describe(
        "Filter parameters by case-insensitive substring match on name",
      ),
  },
});
