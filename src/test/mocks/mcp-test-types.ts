// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Type for MCP text content block */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** Type for MCP tool response */
export interface McpToolResponse {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * Type guard for MCP text content
 * @param content - Content to check
 * @returns True if content is a text content block
 */
export function isTextContent(
  content: unknown,
): content is { type: "text"; text: string } {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as Record<string, unknown>).type === "text" &&
    typeof (content as Record<string, unknown>).text === "string"
  );
}

/**
 * Extract text from MCP response content array
 * @param content - MCP response content array
 * @returns Text content string or undefined
 */
export function getTextContent(content: unknown[]): string | undefined {
  const first = content[0];

  return isTextContent(first) ? first.text : undefined;
}

/**
 * Assert that content is a text content block, throws if not
 * @param content - Content to assert
 */
export function assertTextContent(
  content: unknown,
): asserts content is McpTextContent {
  if (!isTextContent(content)) {
    throw new Error(
      `Expected text content but got: ${JSON.stringify(content)}`,
    );
  }
}
