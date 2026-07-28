// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Render a parsed agent-CLI turn for the console.
 *
 * The AI SDK providers print as they stream (evals/chat/stream.ts); the
 * agent-CLI transports only have the finished JSONL, so they render the whole
 * turn at once with the same shapes — `🔧 tool(args)` / `   ↳ result` lines,
 * then the reply.
 */

import {
  formatToolCall,
  formatToolResult,
} from "#evals/chat/shared/formatting.ts";
import { type ParsedAgentTurn } from "./agent-cli-transport.ts";

/**
 * Format one turn's tool calls and reply text for stdout.
 *
 * Tool calls come first, then the reply: a parsed turn joins every assistant
 * message into one string, so text/tool interleaving is not recoverable (and
 * these CLIs emit their closing message last anyway).
 *
 * @param parsed - The parsed turn
 * @param showUsage - Whether a usage line follows (it supplies its own leading
 *   blank line, so the trailing newline is left off)
 * @returns Text to write to stdout, "" when there is nothing to show
 */
export function formatAgentTurn(
  parsed: ParsedAgentTurn,
  showUsage: boolean,
): string {
  const parts: string[] = [];

  for (const call of parsed.toolCalls) {
    parts.push(formatToolCall(call.name, call.args) + "\n");

    if (call.result != null) {
      parts.push(formatToolResult(call.result, call.warnings));
    }
  }

  if (parsed.text !== "") {
    if (parts.length > 0) parts.push("\n");
    parts.push(parsed.text);
  }

  if (parts.length === 0) return "";
  if (!showUsage) parts.push("\n");

  return parts.join("");
}
