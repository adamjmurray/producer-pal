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
    view: z
      .enum(["session", "arrangement"])
      .optional()
      .describe("Switch between Session and Arrangement views"),
    selectedTrackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Select track by index (0-based)"),
    selectedSceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Select scene by index (0-based)"),
    selectedClipId: z
      .string()
      .nullable()
      .optional()
      .describe("Select clip by ID, or pass null to deselect all clips"),
    showDetail: z
      .enum(["clip", "device"])
      .nullable()
      .optional()
      .describe("Show detail view - 'clip', 'device', or null to hide"),
    showLoop: z
      .boolean()
      .optional()
      .describe("Show loop view for selected clip (boolean)"),
  },
});
