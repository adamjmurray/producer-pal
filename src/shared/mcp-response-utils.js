// Message chunking constants
export const MAX_ERROR_DELIMITER = "$$___MAX_ERRORS___$$";
export const MAX_CHUNK_SIZE = 30000; // ~30KB per chunk, well below the 32,767 limit
export const MAX_CHUNKS = 100; // Allows for ~3MB responses

// Format a successful response with the standard MCP content structure
// non-string results will be JSON-stringified
/**
 * Format a successful MCP response
 *
 * @param {string|object} result - Result to format (strings used as-is, objects JSON-stringified)
 * @returns {object} Formatted MCP response
 */
export function formatSuccessResponse(result) {
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result),
      },
    ],
  };
}

// Format an error response with the standard MCP error structure
/**
 * Format an error MCP response
 *
 * @param {string} errorMessage - Error message text
 * @returns {object} Formatted MCP error response
 */
export function formatErrorResponse(errorMessage) {
  return {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };
}
