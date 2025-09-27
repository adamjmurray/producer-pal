import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

const description = `Reads or updates the view state in Ableton Live.

When called with no arguments, returns the current view state including main view (session/arrangement), selected track/scene/clip/device, selected track type (regular/return/master), highlighted clip slot, detail view status (clip/device), and browser visibility.

When called with arguments, updates the view and returns the full view state with updates optimistically applied. Use update functionality judiciously to avoid interrupting user workflow. Generally only change views when: 1) User explicitly asks to see something, 2) After creating/modifying objects the user specifically asked to work on, 3) Context strongly suggests the user would benefit from seeing the result. When in doubt, don't change views.`;

export const toolDefSelect = defineTool("ppal-select", {
  title: "Selection Controls",
  description,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    // Main view
    view: z
      .enum(["session", "arrangement"])
      .optional()
      .describe("Switch between Session and Arrangement views"),

    // Track selection
    trackId: z.string().optional().describe("Select track by ID"),
    trackType: z
      .enum(["regular", "return", "master"])
      .optional()
      .default("regular")
      .describe("Type of track to select"),
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Track index (0-based) - for regular or return tracks, not used for master. In session view, providing both trackIndex and sceneIndex selects the clip slot.",
      ),

    // Scene selection
    sceneId: z.string().optional().describe("Select scene by ID"),
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Select scene by index (0-based). In session view, providing both trackIndex and sceneIndex selects the clip slot.",
      ),

    // Clip selection
    clipId: z
      .string()
      .nullable()
      .optional()
      .describe("Select clip by ID, or pass null to deselect all clips"),

    // Device selection
    deviceId: z.string().optional().describe("Select device by ID"),
    instrument: z
      .boolean()
      .optional()
      .describe(
        "Select the instrument (or first device) on the selected track",
      ),

    // Detail view
    showDetail: z
      .enum(["clip", "device", "none"])
      .optional()
      .describe("Show detail view - 'clip', 'device', or 'none' to hide"),
    showLoop: z
      .boolean()
      .optional()
      .describe("Show loop view for selected clip"),

    // Browser
    browserVisible: z.boolean().optional().describe("Show or hide the browser"),
  },
});
