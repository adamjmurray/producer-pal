/**
 * Shared streaming utilities for Gemini API responses
 */

import {
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
} from "#evals/chat/shared/formatting.ts";
import type { GeminiResponse, GeminiResponsePart } from "./gemini-types.ts";

/** Tool call with optional result */
export interface StreamToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

/** Result from processing a stream */
export interface StreamResult {
  text: string;
  toolCalls: StreamToolCall[];
}

/**
 * Print streaming Gemini response chunks to stdout
 *
 * @param stream - Async iterable of response chunks
 * @returns Stream result with collected text and tool calls
 */
export async function printGeminiStream(
  stream: AsyncIterable<GeminiResponse>,
): Promise<StreamResult> {
  let inThought = false;
  let text = "";
  let chunkCount = 0;
  const toolCalls: StreamToolCall[] = [];

  for await (const chunk of stream) {
    chunkCount++;
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];

    if (parts.length === 0) {
      // Log warning for chunks with no content (may indicate API issues)
      if (chunkCount === 1 && !chunk.candidates?.length) {
        console.error("\nWarning: First chunk has no candidates");
      }

      continue;
    }

    for (const part of parts) {
      const result = processStreamPart(part, inThought, toolCalls);

      inThought = result.inThought;

      if (result.text) {
        text += result.text;
      }
    }
  }

  console.log();

  // Warn if stream produced no output
  if (chunkCount === 0) {
    console.error(
      "Warning: Stream returned no chunks (API may be unavailable)",
    );
  } else if (text === "" && toolCalls.length === 0) {
    console.error(
      `Warning: Stream returned ${chunkCount} chunks but no text or tool calls`,
    );
  }

  return { text, toolCalls };
}

interface ProcessPartResult {
  inThought: boolean;
  text?: string;
}

/**
 * Process a single response part and write to stdout
 *
 * @param part - Response part containing text, thought, or function call
 * @param inThought - Whether currently inside a thought block
 * @param toolCalls - Tool calls array to append to
 * @returns Result with updated thought state and any collected text
 */
function processStreamPart(
  part: GeminiResponsePart,
  inThought: boolean,
  toolCalls: StreamToolCall[],
): ProcessPartResult {
  if (part.text) {
    if (part.thought) {
      process.stdout.write(
        inThought ? continueThought(part.text) : startThought(part.text),
      );

      return { inThought: true };
    }

    if (inThought) {
      process.stdout.write(endThought());
    }

    process.stdout.write(part.text);

    return { inThought: false, text: part.text };
  }

  if (part.functionCall) {
    process.stdout.write(
      formatToolCall(part.functionCall.name, part.functionCall.args) + "\n",
    );
    toolCalls.push({
      name: part.functionCall.name,
      args: part.functionCall.args,
    });
  }

  if (part.functionResponse) {
    const resultText = part.functionResponse.response?.content?.[0]?.text;

    process.stdout.write(formatToolResult(resultText) + "\n");

    // Attach result to the last tool call
    const lastCall = toolCalls.at(-1);

    if (lastCall && !lastCall.result) {
      lastCall.result = resultText ?? "";
    }
  }

  return { inThought };
}
