import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefSelect = defineTool("ppal-select", {
  title: "Selection Controls",
  description: "Read selection/view state (no args), or update it",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    view: z.enum(["session", "arrangement"]).optional().describe("main view"),
    trackId: z
      .string()
      .optional()
      .describe("select a track with this or trackType/trackIndex"),
    trackType: z
      .enum(["regular", "return", "master"])
      .optional()
      .default("regular")
      .describe(
        "regular and return tracks have independent trackIndexes, master has no index",
      ),
    trackIndex: z.number().int().min(0).optional().describe("0-based index"),
    sceneId: z
      .string()
      .optional()
      .describe("select a scene with this or sceneIndex"),
    sceneIndex: z.number().int().min(0).optional().describe("0-based index"),
    clipId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "select a clip with this or trackIndex + sceneIndex, or null to deselect all clips",
      ),
    deviceId: z.string().optional().describe("select a device"),
    instrument: z
      .boolean()
      .optional()
      .describe("select the track's instrument?"),
    showDetail: z
      .enum(["clip", "device", "none"])
      .optional()
      .describe(
        `show the selected clip or device detail view, or "none" to hide`,
      ),
    showLoop: z
      .boolean()
      .optional()
      .describe("show selected clip's loop view?"),
    browserVisible: z.boolean().optional().describe("show browser view?"),
  },
});
