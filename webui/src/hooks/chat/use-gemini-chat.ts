import type { UIMessage } from "#webui/types/messages";
import { geminiAdapter } from "./gemini-adapter";
import { useChat, type RateLimitState } from "./use-chat";

interface UseGeminiChatProps {
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
 * @param {UseGeminiChatProps} root0 - Chat configuration
 * @param {string} root0.apiKey - Gemini API key
 * @param {string} root0.model - Gemini model name
 * @param {string} root0.thinking - Thinking mode configuration
 * @param {number} root0.temperature - Temperature for response randomness
 * @param {boolean} root0.showThoughts - Whether to display model thoughts
 * @param {Record<string, boolean>} root0.enabledTools - Map of enabled MCP tools
 * @param {"connected" | "connecting" | "error"} root0.mcpStatus - MCP connection status
 * @param {string | null} root0.mcpError - MCP connection error if any
 * @param {() => Promise<void>} root0.checkMcpConnection - Function to verify MCP connection
 * @returns {UseGeminiChatReturn} Chat state and handlers
 */
export function useGeminiChat({
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
