import type { Interface } from "node:readline";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ChatOptions {
  provider: string;
  api?: "chat" | "responses";
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

// OpenRouter Chat API types
export interface OpenRouterReasoningConfig {
  /** Token limit for reasoning (Anthropic-style) */
  max_tokens?: number;
  /** Effort level (OpenAI-style): "low" | "medium" | "high" */
  effort?: "low" | "medium" | "high";
  /** Exclude reasoning from response */
  exclude?: boolean;
  /** Enable with defaults */
  enabled?: boolean;
}

export interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  tools?: OpenRouterTool[];
  reasoning?: OpenRouterReasoningConfig;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface OpenRouterTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  reasoning?: string;
  reasoning_details?: ReasoningDetail[];
}

export interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterChoice {
  index: number;
  message: OpenRouterMessage;
  delta?: Partial<OpenRouterMessage> & {
    reasoning_details?: ReasoningDetail[];
  };
  finish_reason: string | null;
}

export interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      reasoning?: string;
      reasoning_details?: ReasoningDetail[];
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

// OpenRouter Responses API types
export interface ResponsesContentPart {
  type: "input_text" | "output_text";
  text: string;
}

export interface ResponsesOutputItem {
  type: "message" | "function_call" | "reasoning";
  id?: string;
  role?: string;
  content?: ResponsesContentPart[];
  call_id?: string;
  name?: string;
  arguments?: string;
  status?: string;
  summary?: string;
  text?: string;
}

export interface ResponsesAPIResponse {
  id: string;
  object: string;
  output: ResponsesOutputItem[];
  output_text?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export interface ResponsesStreamEvent {
  type: string;
  response?: ResponsesAPIResponse;
  delta?: { text?: string };
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface ResponsesTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ResponsesConversationItem =
  | { type: "message"; role: string; content: string }
  | {
      type: "function_call";
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }
  | { type: "function_call_output"; call_id: string; output: string };
