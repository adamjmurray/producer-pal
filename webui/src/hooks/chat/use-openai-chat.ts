import type { UIMessage } from "#webui/types/messages";
import type { Provider } from "#webui/types/settings";
import { openaiAdapter } from "./openai-adapter";
import { useChat, type RateLimitState } from "./use-chat";

interface UseOpenAIChatProps {
  provider: Provider;
  apiKey: string;
  model: string;
  thinking: string; // Will be mapped to reasoningEffort
  temperature: number;
  baseUrl?: string;
  showThoughts: boolean;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

interface UseOpenAIChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  rateLimitState: RateLimitState | null;
  handleSend: (message: string) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
  stopResponse: () => void;
}

/**
 * Hook for managing OpenAI chat state and message handling
 *
 * @param {UseOpenAIChatProps} options - Chat configuration
 * @param {string} options.apiKey - OpenAI API key
 * @param {string} options.model - OpenAI model name
 * @param {string} options.thinking - Reasoning effort level
 * @param {number} options.temperature - Temperature for response randomness
 * @param {string} [options.baseUrl] - Custom base URL for OpenAI-compatible APIs
 * @param {boolean} options.showThoughts - Whether to include reasoning in response
 * @param {Record<string, boolean>} options.enabledTools - Map of enabled MCP tools
 * @param {"connected" | "connecting" | "error"} options.mcpStatus - MCP connection status
 * @param {string | null} options.mcpError - MCP connection error if any
 * @param {() => Promise<void>} options.checkMcpConnection - Function to verify MCP connection
 * @returns {UseOpenAIChatReturn} Chat state and handlers
 */
export function useOpenAIChat({
  provider,
  apiKey,
  model,
  thinking,
  temperature,
  baseUrl,
  showThoughts,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseOpenAIChatProps): UseOpenAIChatReturn {
  return useChat({
    provider,
    apiKey,
    model,
    thinking,
    temperature,
    enabledTools,
    mcpStatus,
    mcpError,
    checkMcpConnection,
    adapter: openaiAdapter,
    extraParams: { baseUrl, showThoughts },
  });
}
