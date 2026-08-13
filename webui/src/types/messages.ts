// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type definitions for chat messages and formatting.
 *
 * Defines interfaces for:
 * - UI-friendly message structures for rendering
 * - Message formatter and chat client interfaces
 */

import { type TokenUsage } from "#webui/chat/sdk/types";

// UI Part Types
// These represent the different types of content that can appear in a message

export interface UITextPart {
  type: "text";
  content: string;
}

export interface UIThoughtPart {
  type: "thought";
  content: string;
  isOpen?: boolean; // true when this is the last thought and assistant is still responding
}

export interface UIToolPart {
  type: "tool";
  /**
   * The provider's tool-call id. Carried through so a still-running call can be
   * matched to out-of-band live status (see chat/sdk/subagent/subagent-rate-limit.ts).
   * Optional because pre-existing persisted history may predate it.
   */
  id?: string;
  name: string;
  args: Record<string, unknown>;
  result: string | null;
  isError?: boolean;
  /**
   * For a spawn_subagent call: the worker's full transcript, formatted for the
   * deep-dive tier of the subagent card. UI-only — the orchestrator model never
   * sees it (only the compact `result`). Absent for ordinary tool calls.
   */
  subagentMessages?: UIMessage[];
  /**
   * For a spawn_subagent call: which subagent ran, 1-based. Titles the card, so
   * the runs of a resumed worker read as one worker rather than several. Absent
   * for ordinary tool calls and for spawns predating worker numbering.
   */
  subagentIndex?: number;
}

export interface UIStepUsagePart {
  type: "step-usage";
  usage: TokenUsage;
}

export interface UIErrorPart {
  type: "error";
  content: string;
  isError: true;
}

export interface UICompactionPart {
  type: "compaction";
  content: string; // the generated compaction summary
}

export type UIPart =
  | UITextPart
  | UIThoughtPart
  | UIToolPart
  | UIStepUsagePart
  | UIErrorPart
  | UICompactionPart;

// UI Message Structure
// This is the format used throughout the UI for rendering messages

export interface UIMessage {
  role: "user" | "model";
  parts: UIPart[];
  rawHistoryIndex: number; // Maps back to the original index in the raw chat history (used for retry)
  timestamp: number; // Unix timestamp in milliseconds
  /** Model ID from the API response (assistant messages only) */
  responseModel?: string;
  /** Token usage from the API response (assistant messages only) */
  usage?: TokenUsage;
}

// Formatter Interface
// Transforms provider-specific message formats into our unified UI format

export interface MessageFormatter<TRawMessage> {
  format: (history: TRawMessage[]) => UIMessage[];
}

// The live chat-client interface is ChatClient in hooks/chat/use-chat-types.ts.
// A second, unused copy lived here with a one-argument sendMessage; it was
// deleted rather than kept, because a same-named type that no longer describes
// the real client is worse than no type at all — the next person grepping
// ChatClient finds two and has to work out which one anything implements.
