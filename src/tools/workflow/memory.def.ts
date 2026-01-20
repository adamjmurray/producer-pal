import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefMemory = defineTool("ppal-memory", {
  title: "Project Notes",
  description:
    "Read or write project notes (if enabled in Producer Pal device)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    action: z.enum(["read", "write"]).describe("read/write"),
    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("content to write (required for write)"),
  },
});
