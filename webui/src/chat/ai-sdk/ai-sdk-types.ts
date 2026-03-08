// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { type LanguageModel } from "ai";

/**
 * Intermediate message type for the AI SDK client.
 * We use this instead of the SDK's ModelMessage because ModelMessage uses
 * union content types (string | Array<Part>) that are awkward to incrementally
 * build during streaming and to format for the UI. This flat structure is
 * simpler for both the stream processor and the UIMessage formatter.
 */
export interface AiSdkMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    isError?: boolean;
  }>;
  reasoning?: string;
}

/** Configuration for the AI SDK client */
export interface AiSdkClientConfig {
  model: LanguageModel;
  temperature?: number;
  systemInstruction?: string;
  mcpUrl?: string;
  enabledTools?: Record<string, boolean>;
  showThoughts: boolean;
  providerOptions?: ProviderOptions;
  chatHistory?: AiSdkMessage[];
}
