// src/mcp-server/add-tool-memory.js
import { z } from "zod";

export function addToolMemory(server, callLiveApi) {
  server.registerTool(
    "memory",
    {
      title: "Memory Tool for Project Context",
      description:
        "Manages user-defined project context that helps Producer Pal understand project-specific goals and preferences. " +
        "The project context is stored in the Live project and can be enabled and made writable through the Producer Pal device UI. " +
        "Use this tool to read current project context or update it when allowed.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
      inputSchema: {
        action: z
          .enum(["read", "write"])
          .describe(
            "Action to perform: read current project context or write new content",
          ),
        content: z
          .string()
          .optional()
          .describe("Content to write (required when action is 'write')"),
      },
    },
    async (args) => callLiveApi("memory", args),
  );
}
