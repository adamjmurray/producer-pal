// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Interface } from "node:readline";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type EvalProvider } from "#evals/scenarios/types.ts";

export type ReasoningSummary = "auto" | "concise" | "detailed";

/** Thinking level — named levels or numeric token budget strings */
export type ThinkingLevel =
  | "off"
  | "low"
  | "medium"
  | "high"
  | "ultra"
  | "auto"
  | "none"
  | (string & {});

export interface ChatOptions {
  provider: EvalProvider;
  api?: "chat" | "responses";
  model: string;
  stream: boolean;
  debug: boolean;
  thinking?: ThinkingLevel;
  thinkingSummary?: ReasoningSummary;
  randomness?: number;
  outputTokens?: number;
  instructions?: string;
  once?: boolean;
  sequence?: string[];
  file?: string;
}

export interface MessageSource {
  nextMessage: () => Promise<string | null>;
}

/** Token usage for a model generation (per turn or aggregated). */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Reasoning tokens, when the provider reports them */
  reasoningTokens?: number;
  /** Cached (discounted) input tokens, when the provider reports them */
  cachedInputTokens?: number;
}

export interface TurnResult {
  text: string;
  toolCalls: Array<ToolCall & { result?: string }>;
  /** Token usage for this turn (sum across tool-call steps), when available */
  usage?: TokenUsage;
}

export interface ChatContext {
  rl: Interface;
  mcpClient: Client;
  options: ChatOptions;
  model: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}
