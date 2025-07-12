// src/mcp-server/tool-def-memory.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";

export const toolDefMemory = defineTool("memory", {
  title: "Memory Tool for Project Context",
  description:
    "Manages user-defined project context that helps Producer Pal understand project-specific goals and preferences. " +
    "The project context is stored in the Live project and can be enabled and made writable through the Producer Pal device UI. " +
    "Use this tool to read current project context or update it when allowed.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    action: z
      .enum(["read", "write"])
      .describe(
        "Action to perform: read current project context or write new content",
      ),
    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("Content to write (required when action is 'write')"),
  },
});
