// src/mcp-server/tool-def-memory.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";

export const toolDefMemory = defineTool("ppal-memory", {
  title: "Memory Tool for Project Notes",
  description:
    "Manages user-defined project notes that help Producer Pal understand project-specific goals and preferences. " +
    "The project notes are stored in the Live project and can be enabled and made writable through the Producer Pal device UI. " +
    "Use this tool to read current project notes or update them when allowed.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    action: z
      .enum(["read", "write"])
      .describe(
        "Action to perform: read current project notes or write new content",
      ),
    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("Content to write (required when action is 'write')"),
  },
});
