// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * OpenAI Responses API adapter for use with the generic useChat hook.
 * Used for OpenAI's official API to support Codex and other models.
 */
import {
  ResponsesClient,
  type ResponsesClientConfig,
} from "#webui/chat/openai/responses-client";
import { formatResponsesMessages } from "#webui/chat/openai/responses-formatter";
import { buildResponsesConfig } from "#webui/hooks/settings/config-builders";
import type { ResponsesConversationItem } from "#webui/types/responses-api";
import { createResponsesErrorMessage } from "./helpers/streaming-helpers";
import type { ChatAdapter } from "./use-chat";

/**
 * Responses API adapter for OpenAI provider
 */
export const responsesAdapter: ChatAdapter<
  ResponsesClient,
  ResponsesConversationItem,
  ResponsesClientConfig
> = {
  createClient(apiKey: string, config: ResponsesClientConfig): ResponsesClient {
    return new ResponsesClient(apiKey, config);
  },

  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    conversation: ResponsesConversationItem[] | undefined,
    _extraParams?: Record<string, unknown>,
  ): ResponsesClientConfig {
    return buildResponsesConfig(
      model,
      temperature,
      thinking,
      enabledTools,
      conversation,
    );
  },

  formatMessages: formatResponsesMessages,

  createErrorMessage(
    error: unknown,
    conversation: ResponsesConversationItem[],
  ) {
    return createResponsesErrorMessage(conversation, error);
  },

  extractUserMessage(item: ResponsesConversationItem): string | undefined {
    if (item.type !== "message" || item.role !== "user") {
      return undefined;
    }

    const content = item.content;

    if (typeof content === "string") {
      return content.trim();
    }

    // Handle array content format
    return content
      .map((part) => part.text)
      .filter(Boolean)
      .join("")
      .trim();
  },

  createUserMessage(text: string): ResponsesConversationItem {
    return {
      type: "message",
      role: "user",
      content: text,
    };
  },
};
