// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Message chunking constants
export const MAX_ERROR_DELIMITER = "$$___MAX_ERRORS___$$";
export const MAX_CHUNK_SIZE = 30000; // ~30KB per chunk, well below the 32,767 limit
export const MAX_CHUNKS = 100; // Allows for ~3MB responses

export interface ChunkPlan {
  chunks: string[];
  tooLargeError: string | null;
}

/**
 * Split a JSON string into chunks small enough for the Max IPC boundary.
 * Returns a tooLargeError instead of chunks if the payload would exceed
 * MAX_CHUNKS — callers should replace the payload with an error response.
 *
 * @param jsonString - Stringified payload to split
 * @returns Either the chunks or a tooLargeError describing the overflow
 */
export function planChunks(jsonString: string): ChunkPlan {
  const totalChunks = Math.ceil(jsonString.length / MAX_CHUNK_SIZE);

  if (totalChunks > MAX_CHUNKS) {
    return {
      chunks: [],
      tooLargeError: `Response too large: ${jsonString.length} bytes would require ${totalChunks} chunks (max ${MAX_CHUNKS})`,
    };
  }

  const chunks: string[] = [];

  for (let i = 0; i < jsonString.length; i += MAX_CHUNK_SIZE) {
    chunks.push(jsonString.slice(i, i + MAX_CHUNK_SIZE));
  }

  return { chunks, tooLargeError: null };
}

/**
 * Reassemble a chunked Max IPC payload by joining chunks before the
 * MAX_ERROR_DELIMITER. Both production senders (V8 and Node) always
 * terminate their chunk list with the delimiter, so its absence means the
 * payload is malformed — throw so the receiver fails loudly instead of
 * trying to parse a corrupt blob. This matches the explicit delimiter check
 * on the Node-side receive path in `max-api-adapter.ts`.
 *
 * Chunk-order assumption: Max delivers the arguments of a single message
 * (the array passed to outlet/Max.outlet) in the order they were emitted,
 * and `planChunks` slices `jsonString` left-to-right. Reassembly is a
 * plain `.join("")` and relies on that ordering — if a future transport
 * layer reorders or batches arguments, the receiver must sort or tag
 * chunks before joining.
 *
 * @param rest - All args after the leading requestId
 * @returns The reassembled JSON string
 */
export function reassembleChunks(rest: unknown[]): string {
  const delimiterIndex = rest.indexOf(MAX_ERROR_DELIMITER);

  if (delimiterIndex === -1) {
    throw new Error("Missing MAX_ERROR_DELIMITER in response");
  }

  const chunks = rest.slice(0, delimiterIndex);

  return chunks.map(String).join("");
}

interface McpTextContent {
  type: "text";
  text: string;
}

/**
 * Structured discriminator for the error category of an MCP error response.
 * Only "timeout" is defined so far. Callers (e.g. the REST route) use this to
 * map specific error categories to transport-level signals (e.g. HTTP 504)
 * without fragile string-matching of the error message text.
 */
export type McpErrorCode = "timeout";

interface McpResponse {
  content: McpTextContent[];
  isError?: boolean;
  /** Structured error category, set only for specific error origins. */
  errorCode?: McpErrorCode;
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
 * @param errorCode - Optional structured error category (e.g. "timeout") that
 *   downstream transports can map to a status code. Omitted by default so
 *   ordinary errors are indistinguishable from today's responses.
 * @returns Formatted MCP error response
 */
export function formatErrorResponse(
  errorMessage: string,
  errorCode?: McpErrorCode,
): McpResponse {
  const response: McpResponse = {
    content: [{ type: "text", text: errorMessage }],
    isError: true,
  };

  if (errorCode != null) {
    response.errorCode = errorCode;
  }

  return response;
}
