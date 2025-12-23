import type { Interface } from "node:readline";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ChatOptions {
  provider: string;
  model?: string;
  stream: boolean;
  debug: boolean;
  verbose: boolean;
  thinking: boolean;
  thinkingBudget?: number;
  randomness?: number;
  outputTokens?: number;
  systemPrompt?: string;
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

// OpenAI Responses API types
export interface ReasoningDetail {
  type: "reasoning.text" | "reasoning.encrypted" | "reasoning.summary";
  id?: string | null;
  text?: string;
  data?: string;
  summary?: string;
  signature?: string | null;
  format?: string;
  index?: number;
}

export interface ResponseItem {
  type: string;
  id?: string;
  role?: string;
  content?: ResponseContentPart[];
  status?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

export interface ResponseContentPart {
  type: string;
  text?: string;
  annotations?: unknown[];
}
