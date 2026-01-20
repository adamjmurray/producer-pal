// Message chunking constants
export const MAX_ERROR_DELIMITER = "$$___MAX_ERRORS___$$";
export const MAX_CHUNK_SIZE = 30000; // ~30KB per chunk, well below the 32,767 limit
export const MAX_CHUNKS = 100; // Allows for ~3MB responses

interface McpTextContent {
  type: "text";
  text: string;
}

interface McpResponse {
  content: McpTextContent[];
  isError?: boolean;
  // Allow additional properties for MCP SDK compatibility
  [key: string]: unknown;
}

/**
 * Format a successful MCP response
 *
 * @param result - Result to format (strings used as-is, objects JSON-stringified)
 * @returns Formatted MCP response
 */
export function formatSuccessResponse(result: string | object): McpResponse {
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  };
}

/**
 * Format an error MCP response
 *
 * @param errorMessage - Error message text
 * @returns Formatted MCP error response
 */
export function formatErrorResponse(errorMessage: string): McpResponse {
  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };
}
