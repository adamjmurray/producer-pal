import {
  GeminiClient,
  type GeminiClientConfig,
} from "../../chat/gemini-client";
import { formatGeminiMessages } from "../../chat/gemini-formatter";
import type { GeminiMessage } from "../../types/messages";
import { buildGeminiConfig } from "../settings/config-builders";
import { createGeminiErrorMessage } from "./streaming-helpers";
import type { ChatAdapter } from "./use-chat";

/**
 * Gemini provider adapter for use with the generic useChat hook
 */
export const geminiAdapter: ChatAdapter<
  GeminiClient,
  GeminiMessage,
  GeminiClientConfig
> = {
  createClient(apiKey: string, config: GeminiClientConfig): GeminiClient {
    return new GeminiClient(apiKey, config);
  },

  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: GeminiMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): GeminiClientConfig {
    const showThoughts = Boolean(extraParams?.showThoughts);
    return buildGeminiConfig(
      model,
      temperature,
      thinking,
      showThoughts,
      enabledTools,
      chatHistory,
    );
  },

  formatMessages: formatGeminiMessages,

  createErrorMessage(error: unknown, chatHistory: GeminiMessage[]) {
    return createGeminiErrorMessage(error, chatHistory);
  },

  extractUserMessage(message: GeminiMessage): string | undefined {
    return message.parts?.find((part) => part.text)?.text?.trim();
  },

  createUserMessage(text: string): GeminiMessage {
    return {
      role: "user",
      parts: [{ text }],
    };
  },
};
