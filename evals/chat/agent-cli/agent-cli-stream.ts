// Producer Pal
// Copyright (C) 2026 Taylor Haun, Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The JSONL scaffolding every agent-CLI transport parses through.
 *
 * The vendors' event schemas differ, but the shape around them does not: split
 * stdout into lines, skip whatever isn't JSON, fold each event into an
 * accumulator, and either throw the CLI's own error or hand back one turn. Only
 * the fold is per-vendor — that is the callback a transport supplies.
 */

import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import { mcpResultText } from "../shared/mcp-result-text.ts";
import { type ToolCall } from "../shared/types.ts";
import { type ParsedAgentTurn } from "./agent-cli-transport.ts";

/** The accumulator a transport folds its events into. */
export interface AgentStreamState {
  /** Assistant messages in order, joined by the transport's separator. */
  textParts: string[];
  toolCalls: ToolCall[];
  /** Calls awaiting a result, keyed however the transport pairs its events. */
  openCalls: Map<string, ToolCall>;
  sessionId?: string;
  usage?: TokenUsage;
  /** Set to fail the whole turn; the CLI's own message. */
  error?: string;
}

export interface ParseAgentCliStreamOptions {
  /** CLI name, prefixed to a thrown error. */
  label: string;
  /** Separator between assistant messages ("" concatenates, as Codex does). */
  textSeparator: string;
  /** Fold one parsed event into the accumulator. */
  handleEvent: (
    event: Record<string, unknown>,
    state: AgentStreamState,
  ) => void;
}

/**
 * Parse one turn of JSONL into the shared eval result shape.
 *
 * @param stdout - The CLI's JSONL stdout
 * @param options - Label, text separator, and the per-vendor event handler
 * @returns Parsed assistant text, tool calls, session ID, and token usage
 * @throws Error when the stream reported a failed turn
 */
export function parseAgentCliStream(
  stdout: string,
  options: ParseAgentCliStreamOptions,
): ParsedAgentTurn {
  const state: AgentStreamState = {
    textParts: [],
    toolCalls: [],
    openCalls: new Map(),
  };

  for (const line of stdout.split("\n")) {
    const event = parseJsonlLine(line);

    if (event != null) options.handleEvent(event, state);
  }

  if (state.error != null) {
    throw new Error(`${options.label} error: ${state.error}`);
  }

  return {
    text: state.textParts.join(options.textSeparator),
    toolCalls: state.toolCalls,
    ...(state.sessionId != null ? { sessionId: state.sessionId } : {}),
    ...(state.usage != null ? { usage: state.usage } : {}),
  };
}

/**
 * Parse a JSONL line, ignoring diagnostics written to stdout.
 *
 * @param line - One stdout line
 * @returns Parsed event, or undefined for blank or non-JSON output
 */
export function parseJsonlLine(
  line: string,
): Record<string, unknown> | undefined {
  const trimmed = line.trim();

  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Normalize tool arguments, which arrive as an object or a JSON string.
 *
 * @param value - Raw arguments from the stream
 * @returns Object arguments for the shared tool-call shape
 */
export function toToolArguments(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (
        parsed != null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Serialize an MCP tool result for eval reports.
 *
 * Unwrap the first text block so results read like the AI SDK path's — this
 * string is what the console, the JSON report, and the judge prompt all show.
 *
 * @param value - Raw MCP result, its content array, or plain text
 * @returns String result
 */
export function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;

  return mcpResultText(value) || JSON.stringify(value);
}

/**
 * Return a numeric token counter, or zero when absent.
 *
 * @param value - Raw counter
 * @returns Numeric counter
 */
export function tokenCount(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
