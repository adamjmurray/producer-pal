// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Part } from "@google/genai/web";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { GeminiMessage } from "#webui/types/messages";

/**
 * Part with optional function call
 */
export interface FunctionCallPart {
  functionCall?: { name?: string; args?: unknown };
}

/**
 * Part with text and thought properties for merging logic
 */
export interface TextPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: unknown;
}

/**
 * Checks if a part is a tool call
 * @param {unknown} part - Part to check
 * @returns {boolean} - Whether the part is a tool call
 */
export function isToolCall(part: unknown): boolean {
  const partAny = part as { functionCall?: unknown };

  return Boolean(partAny.functionCall);
}

/**
 * Checks if a tool result is an error
 * @param {unknown} result - Tool result to check
 * @returns {boolean} - Whether the result is an error
 */
export function isErrorResult(result: unknown): boolean {
  const resultAny = result as { isError?: boolean };

  return Boolean(resultAny.isError);
}

/**
 * Builds an error response part from a caught error
 * @param {unknown} error - Error that was caught
 * @param {string} [toolName] - Name of the tool that failed
 * @returns {object} - Error response part
 */
export function buildErrorResponse(
  error: unknown,
  toolName: string | undefined,
): unknown {
  return {
    functionResponse: {
      name: toolName,
      response: {
        error: error instanceof Error ? error.message : String(error),
        isError: true,
      },
    },
  };
}

/**
 * Executes a single tool call and returns the response part
 * @param {FunctionCallPart} part - Part containing the function call
 * @param {Client | null} mcpClient - MCP client instance
 * @returns {Promise<unknown>} - Function response part
 */
export async function executeSingleTool(
  part: FunctionCallPart,
  mcpClient: Client | null,
): Promise<unknown> {
  const functionCall = part.functionCall;

  if (!mcpClient) {
    return buildErrorResponse(
      new Error("MCP client not initialized"),
      functionCall?.name,
    );
  }

  try {
    const result = await mcpClient.callTool({
      name: functionCall?.name ?? "",
      arguments: functionCall?.args as Record<string, unknown>,
    });

    return {
      functionResponse: {
        name: functionCall?.name,
        response: isErrorResult(result) ? { error: result } : result,
      },
    };
  } catch (error) {
    return buildErrorResponse(error, functionCall?.name);
  }
}

/**
 * Executes all tool calls in the message
 * @param {GeminiMessage | undefined} lastMessage - Last message containing tool calls
 * @param {Client | null} mcpClient - MCP client instance
 * @returns {Promise<unknown[]>} - Array of function response parts
 */
export async function executeToolCalls(
  lastMessage: GeminiMessage | undefined,
  mcpClient: Client | null,
): Promise<unknown[]> {
  const functionResponseParts: unknown[] = [];

  for (const part of lastMessage?.parts ?? []) {
    if (!isToolCall(part)) continue;

    const toolResponsePart = await executeSingleTool(
      part as FunctionCallPart,
      mcpClient,
    );

    functionResponseParts.push(toolResponsePart);
  }

  return functionResponseParts;
}

/**
 * Checks if the last message contains unexecuted function calls
 * @param {GeminiMessage | undefined} lastMessage - Last message in chat history
 * @returns {boolean} - Whether the message contains unexecuted function calls
 */
export function hasUnexecutedFunctionCalls(
  lastMessage: GeminiMessage | undefined,
): boolean {
  return (
    lastMessage?.role === "model" &&
    Boolean(lastMessage.parts?.some((part) => isToolCall(part)))
  );
}

/**
 * Determines if a text part should be merged with the last part
 * @param {TextPart} part - Part to check
 * @param {unknown} lastPart - Last part in the current turn
 * @returns {boolean} - Whether to merge the parts
 */
export function shouldMergeWithLastPart(
  part: TextPart,
  lastPart: unknown,
): boolean {
  const lastPartAny = lastPart as TextPart | undefined;

  return (
    // if consecutive parts are text, we potentially can concatenate
    Boolean(part.text) &&
    Boolean(lastPartAny?.text) &&
    // if we switch between thoughts and normal text, don't concatenate:
    Boolean(part.thought) === Boolean(lastPartAny?.thought) &&
    // if anything has a thoughtSignature, don't concatenate:
    !lastPartAny?.thoughtSignature &&
    !part.thoughtSignature
  );
}

/**
 * Adds a part to the current turn, merging text if possible
 * @param {GeminiMessage} currentTurn - Current message turn being built
 * @param {Part} part - Part to add to the turn
 */
export function addOrMergePartToTurn(
  currentTurn: GeminiMessage,
  part: Part,
): void {
  const lastPart = currentTurn.parts?.at(-1);
  const partAny = part as TextPart;

  if (shouldMergeWithLastPart(partAny, lastPart)) {
    const lastPartAny = lastPart as { text?: string };

    if (lastPartAny.text && partAny.text) {
      lastPartAny.text += partAny.text;
    }
  } else {
    currentTurn.parts?.push(part);
  }
}
