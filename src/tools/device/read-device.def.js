import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description:
    "Read information about a device, chain, or drum pad by ID or path.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    deviceId: z.string().optional().describe("Device ID to read"),
    path: z
      .string()
      .optional()
      .describe(
        "Device/chain/drum-pad path: t=track, rt=return, mt=master, d=device, c=chain, rc=return chain, p=drum pad. " +
          "E.g., 't1/d0' (device), 't1/d0/c0' (chain), 't1/d0/pC1' (drum pad), 't1/d0/rc0' (return chain)",
      ),
    include: z
      .array(
        z.enum([
          "*",
          "chains",
          "return-chains",
          "drum-pads",
          "params",
          "param-values",
        ]),
      )
      .default(["chains"])
      .describe(
        "Array of data to include. Options: " +
          "'*' (all), 'chains', 'return-chains' (rack send/return chains), 'drum-pads', " +
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
