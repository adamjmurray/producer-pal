// src/mcp-server/tool-def-update-view.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";

const description = `Updates the view state in Ableton Live. Use judiciously to avoid interrupting user workflow. Generally only change views when: 1) User explicitly asks to see something, 2) After creating/modifying objects the user specifically asked to work on, 3) Context strongly suggests the user would benefit from seeing the result. When in doubt, don't change views.`;

export const toolDefUpdateView = defineTool("ppal-update-view", {
  title: "Update View State",
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
    selectedTrackId: z.string().optional().describe("Select track by ID"),
    selectedTrackType: z
      .enum(["regular", "return", "master"])
      .optional()
      .describe("Type of track to select"),
    selectedTrackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Track index (0-based) - for regular or return tracks, not used for master",
      ),

    // Scene selection
    selectedSceneId: z.string().optional().describe("Select scene by ID"),
    selectedSceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Select scene by index (0-based)"),

    // Clip selection
    selectedClipId: z
      .string()
      .nullable()
      .optional()
      .describe("Select clip by ID, or pass null to deselect all clips"),

    // Device selection
    selectedDeviceId: z.string().optional().describe("Select device by ID"),
    selectInstrument: z
      .boolean()
      .optional()
      .describe(
        "Select the instrument (or first device) on the selected track",
      ),

    // Highlighted clip slot
    highlightedClipSlotId: z
      .string()
      .optional()
      .describe("Set highlighted clip slot by ID"),
    highlightedClipSlot: z
      .object({
        trackIndex: z.number().int().min(0),
        clipSlotIndex: z.number().int().min(0),
      })
      .optional()
      .describe("Set highlighted clip slot by track and clip slot indices"),

    // Detail view
    showDetail: z
      .enum(["clip", "device"])
      .nullable()
      .optional()
      .describe("Show detail view - 'clip', 'device', or null to hide"),
    showLoop: z
      .boolean()
      .optional()
      .describe("Show loop view for selected clip"),

    // Browser
    browserVisible: z.boolean().optional().describe("Show or hide the browser"),
  },
});
