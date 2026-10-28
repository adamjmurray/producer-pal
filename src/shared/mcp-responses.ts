// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { isHighSurrogate, utf8ByteLength } from "./max/utf8-byte-length.ts";

/**
 * Marks a content item as a warning rather than part of the result. The REST
 * route splits on it, so a producer that spells it differently has its warning
 * filed as an appended block instead. Case included.
 */
export const WARNING_PREFIX = "WARNING: ";

// Message chunking constants
export const END_OF_CHUNKS = "$$___END_OF_CHUNKS___$$";
/**
 * Max caps a message at ~32,767 UTF-8 bytes, but we count UTF-16 units. A unit
 * is at most 3 bytes, so 10,000 units never pass 30,000 bytes whatever the text.
 */
export const MAX_CHUNK_SIZE = 10000;
export const MAX_CHUNKS = 300; // Allows for ~3MB responses
/** Largest single (unchunked) message, in UTF-8 bytes, kept under Max's limit. */
export const MAX_SINGLE_MESSAGE_BYTES = 30000;

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
  const estimate = Math.ceil(jsonString.length / MAX_CHUNK_SIZE);

  if (estimate > MAX_CHUNKS) {
    return tooLarge(jsonString.length, estimate);
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < jsonString.length) {
    let end = Math.min(start + MAX_CHUNK_SIZE, jsonString.length);

    // Don't cut a surrogate pair in two: each half would arrive as U+FFFD.
    if (
      end < jsonString.length &&
      isHighSurrogate(jsonString.charCodeAt(end - 1))
    ) {
      end--;
    }

    chunks.push(jsonString.slice(start, end));
    start = end;
  }

  // Backing off can add a chunk beyond the estimate.
  return chunks.length > MAX_CHUNKS
    ? tooLarge(jsonString.length, chunks.length)
    : { chunks, tooLargeError: null };
}

/**
 * @param length - The payload's length in chars
 * @param chunkCount - How many chunks it would take
 * @returns A plan with no chunks and the overflow message
 */
function tooLarge(length: number, chunkCount: number): ChunkPlan {
  return {
    chunks: [],
    tooLargeError: `Response too large: ${length} chars would require ${chunkCount} chunks (max ${MAX_CHUNKS})`,
  };
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

/** What a too-large code-exec message tells the caller to do. */
export const CODE_EXEC_TOO_LARGE_ADVICE =
  "The code-exec protocol does not chunk: use fewer notes or a smaller clip.";

/**
 * Guard for a payload sent as a SINGLE unchunked Max IPC string (code-exec and
 * node_request, unlike responses, which split with planChunks). Max silently
 * truncates a message past ~32,767 UTF-8 bytes, so reject past
 * MAX_SINGLE_MESSAGE_BYTES and fail loudly instead.
 *
 * @param jsonString - The stringified payload about to be sent
 * @param label - Human label for the payload (e.g. "code-exec request")
 * @param advice - What the caller can do about it
 * @returns An error message when too large, or null when it fits
 */
export function oversizedSingleMessageError(
  jsonString: string,
  label: string,
  advice: string,
): string | null {
  const bytes = utf8ByteLength(jsonString);

  if (bytes <= MAX_SINGLE_MESSAGE_BYTES) {
    return null;
  }

  return `${label} too large for a single Max IPC message: ${bytes} bytes exceeds ${MAX_SINGLE_MESSAGE_BYTES}. ${advice}`;
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

export interface McpResponse {
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
