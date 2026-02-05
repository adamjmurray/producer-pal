// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Types for OpenAI Responses API
 * Used by ResponsesClient for conversation with OpenAI's newer API format
 */

/** Reasoning summary format options */
export type ReasoningSummary = "auto" | "concise" | "detailed";

/** Conversation item types for Responses API input */
export type ResponsesConversationItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem;

export interface ResponsesMessageItem {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string | ResponsesContentPart[];
}

export interface ResponsesFunctionCallItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface ResponsesFunctionCallOutputItem {
  type: "function_call_output";
  call_id: string;
  output: string;
}

/** Content part in message responses */
export interface ResponsesContentPart {
  type: "input_text" | "output_text";
  text: string;
}

/** Tool format for Responses API (flat structure, not nested under "function") */
export interface ResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Output item types from Responses API */
export type ResponsesOutputItem =
  | ResponsesMessageOutput
  | ResponsesFunctionCallOutput
  | ResponsesReasoningOutput;

export interface ResponsesMessageOutput {
  type: "message";
  id: string;
  role: "assistant";
  content: ResponsesContentPart[];
  status?: string;
}

export interface ResponsesFunctionCallOutput {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface ResponsesReasoningOutput {
  type: "reasoning";
  id?: string;
  summary?: unknown;
  text?: string;
}

/** Complete response from responses.create() */
export interface ResponsesResult {
  id: string;
  output: ResponsesOutputItem[];
}

/** Stream event from responses.create({ stream: true }) */
export interface ResponsesStreamEvent {
  type: string;
  delta?: { text?: string } | string;
  item_id?: string;
  arguments?: string;
  item?: {
    id: string;
    type: string;
    name?: string;
    call_id?: string;
  };
  response?: {
    output?: ResponsesOutputItem[];
  };
}

/** State tracking during streaming */
export interface ResponsesStreamState {
  currentContent: string;
  currentReasoning: string;
  pendingFunctionCalls: Map<string, { name: string; call_id: string }>;
  toolResults: Map<string, string>;
  hasToolCalls: boolean;
  outputItems: ResponsesOutputItem[];
  /** Index of streaming placeholder message in conversation, null if not yet created */
  streamingItemIndex: number | null;
}
