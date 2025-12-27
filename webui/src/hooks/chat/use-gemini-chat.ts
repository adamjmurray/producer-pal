import type { UIMessage } from "#webui/types/messages";
import type { Provider } from "#webui/types/settings";
import { geminiAdapter } from "./gemini-adapter";
import { useChat, type RateLimitState } from "./use-chat";

interface UseGeminiChatProps {
  provider: Provider;
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

interface UseGeminiChatReturn {
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
 * Hook for managing Gemini chat state and message handling
 *
 * @param {UseGeminiChatProps} options - Chat configuration
 * @param {string} options.apiKey - Gemini API key
 * @param {string} options.model - Gemini model name
 * @param {string} options.thinking - Thinking mode configuration
 * @param {number} options.temperature - Temperature for response randomness
 * @param {boolean} options.showThoughts - Whether to display model thoughts
 * @param {Record<string, boolean>} options.enabledTools - Map of enabled MCP tools
 * @param {"connected" | "connecting" | "error"} options.mcpStatus - MCP connection status
 * @param {string | null} options.mcpError - MCP connection error if any
 * @param {() => Promise<void>} options.checkMcpConnection - Function to verify MCP connection
 * @returns {UseGeminiChatReturn} Chat state and handlers
 */
export function useGeminiChat({
  provider,
  apiKey,
  model,
  thinking,
  temperature,
  showThoughts,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseGeminiChatProps): UseGeminiChatReturn {
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
    adapter: geminiAdapter,
    extraParams: { showThoughts },
  });
}
