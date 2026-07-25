// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Render a parsed Codex turn for the console.
 *
 * The AI SDK providers print as they stream (evals/chat/stream.ts); the Codex
 * transport only has the finished JSONL, so it renders the whole turn at once
 * with the same shapes — `🔧 tool(args)` / `   ↳ result` lines, then the reply.
 */

import {
  formatToolCall,
  formatToolResult,
} from "#evals/chat/shared/formatting.ts";
import { type ParsedCodexTurn } from "./codex-cli-protocol.ts";

/**
 * Format one Codex turn's tool calls and reply text for stdout.
 *
 * Tool calls come first, then the reply: parseCodexStream concatenates every
 * `agent_message` into one string, so text/tool interleaving is not recoverable
 * (and Codex emits its message last in practice anyway).
 *
 * @param parsed - The parsed turn
 * @param showUsage - Whether a usage line follows (it supplies its own leading
 *   blank line, so the trailing newline is left off)
 * @returns Text to write to stdout, "" when there is nothing to show
 */
export function formatCodexTurn(
  parsed: ParsedCodexTurn,
  showUsage: boolean,
): string {
  const parts: string[] = [];

  for (const call of parsed.toolCalls) {
    parts.push(formatToolCall(call.name, call.args) + "\n");

    if (call.result != null) parts.push(formatToolResult(call.result));
  }

  if (parsed.text !== "") {
    if (parts.length > 0) parts.push("\n");
    parts.push(parsed.text);
  }

  if (parts.length === 0) return "";
  if (!showUsage) parts.push("\n");

  return parts.join("");
}
