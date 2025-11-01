import { useCallback, useRef, useState } from "preact/hooks";
import {
  GeminiClient,
  type GeminiClientConfig,
} from "../chat/gemini-client.js";
import { formatGeminiMessages } from "../chat/gemini-formatter.js";
import { getThinkingBudget, SYSTEM_INSTRUCTION } from "../config.js";
import type { GeminiMessage, UIMessage } from "../types/messages.js";

function createErrorMessage(
  error: unknown,
  chatHistory: GeminiMessage[],
): UIMessage[] {
  console.error(error);
  let errorMessage = `${error}`;
  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  const errorEntry = {
    role: "error",
    parts: [{ text: errorMessage }],
  };

  return formatGeminiMessages([...chatHistory, errorEntry]);
}

interface UseGeminiChatProps {
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
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
  handleSend: (message: string) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
}

export function useGeminiChat({
  apiKey,
  model,
  thinking,
  temperature,
  showThoughts,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseGeminiChatProps): UseGeminiChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const geminiRef = useRef<GeminiClient | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    geminiRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: GeminiMessage[]) => {
      // Auto-retry MCP connection if it failed
      if (mcpStatus === "error") {
        await checkMcpConnection();
        if (mcpStatus === "error") {
          throw new Error(`MCP connection failed: ${mcpError}`);
        }
      }

      const thinkingBudget = getThinkingBudget(thinking);
      const config: GeminiClientConfig = {
        model,
        temperature,
        systemInstruction: SYSTEM_INSTRUCTION,
      };

      if (chatHistory) {
        config.chatHistory = chatHistory;
      }

      // Only set thinkingConfig if thinking is not disabled (0)
      // For Auto mode (-1) or specific budgets (>0), include thoughts based on user setting
      if (thinkingBudget !== 0) {
        config.thinkingConfig = {
          thinkingBudget,
          includeThoughts: showThoughts,
        };
      }

      geminiRef.current = new GeminiClient(apiKey, config);
      await geminiRef.current.initialize();
      setActiveModel(model);
      setActiveThinking(thinking);
      setActiveTemperature(temperature);
    },
    [
      mcpStatus,
      checkMcpConnection,
      mcpError,
      thinking,
      model,
      temperature,
      showThoughts,
      apiKey,
    ],
  );

  const handleSend = useCallback(
    async (message: string) => {
      if (!apiKey) return;
      if (!message?.trim()) return;

      const userMessage = message.trim();
      setIsAssistantResponding(true);

      try {
        if (!geminiRef.current) {
          await initializeChat();
        }

        const stream = geminiRef.current.sendMessage(userMessage);

        for await (const chatHistory of stream) {
          // console.log(
          //   "useGeminiChat received chunk, now history is",
          //   JSON.stringify(chatHistory, null, 2),
          // );
          setMessages(formatGeminiMessages(chatHistory));
        }
      } catch (error) {
        setMessages(
          createErrorMessage(error, geminiRef.current?.chatHistory ?? []),
        );
      } finally {
        setIsAssistantResponding(false);
      }
    },
    [apiKey, initializeChat],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      if (!apiKey) return;

      const message = messages[mergedMessageIndex];
      if (!message || message.role !== "user") return;

      const rawIndex = message.rawHistoryIndex;
      const rawMessage = geminiRef.current.chatHistory[rawIndex];
      if (!rawMessage) return;

      // Extract the user message text
      const userMessage = rawMessage.parts
        ?.find((part) => part.text)
        ?.text?.trim();

      if (!userMessage) return;

      setIsAssistantResponding(true);

      try {
        // Slice history to exclude this message and everything after
        const slicedHistory = geminiRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        const stream = geminiRef.current.sendMessage(userMessage);

        for await (const chatHistory of stream) {
          setMessages(formatGeminiMessages(chatHistory));
        }
      } catch (error) {
        setMessages(
          createErrorMessage(error, geminiRef.current?.chatHistory ?? []),
        );
      } finally {
        setIsAssistantResponding(false);
      }
    },
    [apiKey, messages, initializeChat],
  );

  return {
    messages,
    isAssistantResponding,
    activeModel,
    activeThinking,
    activeTemperature,
    handleSend,
    handleRetry,
    clearConversation,
  };
}
