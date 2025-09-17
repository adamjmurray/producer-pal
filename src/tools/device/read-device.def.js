import { z } from "zod";
import { DEVICE_TYPES } from "../constants.js";
import { defineTool } from "../shared/define-tool.js";

/**
 * HISTORICAL NOTE (Sept 2025):
 * This tool was created as a fallback mechanism for a hypothetical edge case where
 * read-track would fail due to massive numbers of nested rack devices. In practice,
 * this has never been needed because:
 *
 * 1. Performance improvements (chunking, better timeouts) solved the underlying issues
 * 2. The overhauled include system with sensible defaults prevents most timeouts
 * 3. ppal-init separates initialization from reading, reducing initial load
 * 4. No real-world use case has emerged requiring direct device access by ID
 *
 * The tool is implemented but not exposed via MCP to save context window space.
 * If you ever encounter projects where read-track consistently fails due to
 * device complexity, this tool can be re-enabled by uncommenting its registration
 * in create-mcp-server.js.
 *
 * Last verified unused: Sept 2025 (searched all conversations, zero organic usage)
 */
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
