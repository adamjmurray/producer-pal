// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Marks a content item as a warning rather than part of the result. The REST
 * route splits on it, so a producer that spells it differently has its warning
 * filed as an appended block instead. Case included.
 */
export const WARNING_PREFIX = "WARNING: ";

// Message chunking constants
export const END_OF_CHUNKS = "$$___END_OF_CHUNKS___$$";
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
 * Reassemble a chunked Max IPC payload by joining the chunks before
 * END_OF_CHUNKS. Both production senders (V8 and Node) always terminate their
 * chunk list with it, so its absence means the payload is malformed — throw so
 * the receiver fails loudly instead of parsing a corrupt blob. It also
 * separates "sent an empty payload" from "sent nothing at all", which a bare
 * `join("")` would collapse into the same vague JSON.parse failure.
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
  const endIndex = rest.indexOf(END_OF_CHUNKS);

  if (endIndex === -1) {
    throw new Error("Missing END_OF_CHUNKS in response");
  }

  return rest.slice(0, endIndex).map(String).join("");
}

/**
 * Guard for a payload sent as a SINGLE unchunked Max IPC string — the code-exec
 * sub-protocol, unlike node_response which splits with planChunks. Max silently
 * truncates or drops a string past its ~32,767-char limit, corrupting the
 * message. Reject at MAX_CHUNK_SIZE (the same conservative bound a single chunk
 * uses) so the caller fails loudly with a clear message instead.
 *
 * @param jsonString - The stringified payload about to be sent
 * @param label - Human label for the payload (e.g. "code-exec request")
 * @returns An error message when too large, or null when it fits
 */
export function oversizedSingleMessageError(
  jsonString: string,
  label: string,
): string | null {
  if (jsonString.length <= MAX_CHUNK_SIZE) {
    return null;
  }

  return `${label} too large for a single Max IPC message: ${jsonString.length} chars exceeds ${MAX_CHUNK_SIZE} (the code-exec protocol does not chunk). Use fewer notes or a smaller clip.`;
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
