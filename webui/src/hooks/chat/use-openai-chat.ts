import type { UIMessage } from "@/types/messages";
import { openaiAdapter } from "./openai-adapter";
import { useChat } from "./use-chat";

interface UseOpenAIChatProps {
  apiKey: string;
  model: string;
  thinking: string; // Will be mapped to reasoningEffort
  temperature: number;
  baseUrl?: string;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

interface UseOpenAIChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  handleSend: (message: string) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
  stopResponse: () => void;
}

/**
 * Hook for managing OpenAI chat state and message handling
 *
 * @param {UseOpenAIChatProps} root0 - Chat configuration
 * @param {string} root0.apiKey - OpenAI API key
 * @param {string} root0.model - OpenAI model name
 * @param {string} root0.thinking - Reasoning effort level
 * @param {number} root0.temperature - Temperature for response randomness
 * @param {string} [root0.baseUrl] - Custom base URL for OpenAI-compatible APIs
 * @param {Record<string, boolean>} root0.enabledTools - Map of enabled MCP tools
 * @param {"connected" | "connecting" | "error"} root0.mcpStatus - MCP connection status
 * @param {string | null} root0.mcpError - MCP connection error if any
 * @param {() => Promise<void>} root0.checkMcpConnection - Function to verify MCP connection
 * @returns {UseOpenAIChatReturn} Chat state and handlers
 */
export function useOpenAIChat({
  apiKey,
  model,
  thinking,
  temperature,
  baseUrl,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseOpenAIChatProps): UseOpenAIChatReturn {
  return useChat({
    apiKey,
    model,
    thinking,
    temperature,
    enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: openaiAdapter,
    extraParams: { baseUrl },
  });
}
