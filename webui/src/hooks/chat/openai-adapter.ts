import {
  OpenAIClient,
  type OpenAIClientConfig,
} from "../../chat/openai-client";
import { formatOpenAIMessages } from "../../chat/openai-formatter";
import type { OpenAIMessage } from "../../types/messages";
import { buildOpenAIConfig } from "../settings/config-builders";
import { createOpenAIErrorMessage } from "./streaming-helpers";
import type { ChatAdapter } from "./use-chat";

/**
 * OpenAI provider adapter for use with the generic useChat hook
 */
export const openaiAdapter: ChatAdapter<
  OpenAIClient,
  OpenAIMessage,
  OpenAIClientConfig
> = {
  createClient(apiKey: string, config: OpenAIClientConfig): OpenAIClient {
    return new OpenAIClient(apiKey, config);
  },

  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: OpenAIMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): OpenAIClientConfig {
    const baseUrl = extraParams?.baseUrl as string | undefined;
    return buildOpenAIConfig(
      model,
      temperature,
      thinking,
      baseUrl,
      enabledTools,
      chatHistory,
    );
  },

  formatMessages: formatOpenAIMessages,

  createErrorMessage(error: unknown, chatHistory: OpenAIMessage[]) {
    return createOpenAIErrorMessage(chatHistory, error);
  },

  extractUserMessage(message: OpenAIMessage): string | undefined {
    return message.role === "user" && typeof message.content === "string"
      ? message.content.trim()
      : undefined;
  },

  createUserMessage(text: string): OpenAIMessage {
    return {
      role: "user",
      content: text,
    };
  },
};
