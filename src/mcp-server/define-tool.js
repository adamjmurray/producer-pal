// src/mcp-server/define-tool.js
import { z } from "zod";

export function defineTool(name, options) {
  return (server, callLiveApi) => {
    const { inputSchema, ...toolConfig } = options;

    server.registerTool(
      name,
      {
        ...toolConfig,
        inputSchema,
      },
      async (args) => {
        // Create Zod object schema from the input schema object for validation
        const validation = z.object(inputSchema).safeParse(args);

        if (!validation.success) {
          const errorMessages = validation.error.issues.map((issue) => {
            const path =
              issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
            return `${path}${issue.message}`;
          });

          return {
            content: [
              {
                type: "text",
                text: `Validation error in ${name}:\n${errorMessages.join("\n")}`,
              },
            ],
            isError: true,
          };
        }

        return await callLiveApi(name, validation.data);
      },
    );
  };
}
