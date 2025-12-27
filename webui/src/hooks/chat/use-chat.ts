import { useCallback, useRef, useState } from "preact/hooks";
import {
  detectRateLimit,
  calculateRetryDelay,
  shouldRetry,
  MAX_RETRY_ATTEMPTS,
} from "#webui/lib/rate-limit";
import type { UIMessage } from "#webui/types/messages";
import type { Provider } from "#webui/types/settings";
import {
  handleMessageStream,
  validateMcpConnection,
} from "./streaming-helpers";

/** Per-message overrides for thinking, temperature, and showThoughts */
export interface MessageOverrides {
  thinking?: string;
  temperature?: number;
  showThoughts?: boolean;
}

/** Chat client interface that all providers must implement */
export interface ChatClient<TMessage> {
  chatHistory: TMessage[];
  initialize(): Promise<void>;
  sendMessage(
    message: string,
    signal: AbortSignal,
    overrides?: MessageOverrides,
  ): AsyncIterable<TMessage[]>;
}

/**
 * Provider-specific adapter interface
 */
export interface ChatAdapter<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  /**
   * Create a new client instance
   */
  createClient(apiKey: string, config: TConfig): TClient;

  /**
   * Build provider-specific configuration
   */
  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: TMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): TConfig;

  /**
   * Format messages for UI display
   */
  formatMessages(messages: TMessage[]): UIMessage[];

  /**
   * Create error message in provider's format
   */
  createErrorMessage(error: unknown, chatHistory: TMessage[]): UIMessage[];

  /**
   * Extract user message text from a message for retry
   */
  extractUserMessage(message: TMessage): string | undefined;

  /**
   * Create initial user message for error display
   */
  createUserMessage(text: string): TMessage;
}

interface UseChatProps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  provider: Provider;
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  extraParams?: Record<string, unknown>;
}

/**
 * Rate limit retry state for UI display
 */
export interface RateLimitState {
  isRetrying: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

interface UseChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  rateLimitState: RateLimitState | null;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
  stopResponse: () => void;
}

/**
 * Generic chat hook that works with any provider via an adapter
 *
 * @param {UseChatProps} props - Chat configuration and adapter
 * @returns {UseChatReturn} Chat state and handlers
 */
// eslint-disable-next-line max-lines-per-function
export function useChat<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>({
  provider,
  apiKey,
  model,
  thinking,
  temperature,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  adapter,
  extraParams,
}: UseChatProps<TClient, TMessage, TConfig>): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(
    null,
  );
  const clientRef = useRef<TClient | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<AbortController | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current = null;
    setActiveModel(null);
    setActiveProvider(null);
    setActiveThinking(null);
    setActiveTemperature(null);
    setRateLimitState(null);
    retryAbortRef.current?.abort();
  }, []);

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    retryAbortRef.current?.abort();
    setIsAssistantResponding(false);
    setRateLimitState(null);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: TMessage[], overrides?: MessageOverrides) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);

      const effectiveThinking = overrides?.thinking ?? thinking;
      const effectiveTemperature = overrides?.temperature ?? temperature;

      const config = adapter.buildConfig(
        model,
        effectiveTemperature,
        effectiveThinking,
        enabledTools,
        chatHistory,
        extraParams,
      );

      clientRef.current = adapter.createClient(apiKey, config);
      await clientRef.current.initialize();
      setActiveModel(model);
      setActiveProvider(provider);
      setActiveThinking(effectiveThinking);
      setActiveTemperature(effectiveTemperature);
    },
    [
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      provider,
      temperature,
      thinking,
      enabledTools,
      apiKey,
      adapter,
      extraParams,
    ],
  );

  /**
   * Executes a stream request with automatic retry on rate limit errors.
   * If content was received before the error, sends "continue" on retry
   * instead of the original message.
   */
  const executeWithRetry = useCallback(
    async (
      executeStream: (message: string) => AsyncIterable<TMessage[]>,
      getChatHistory: () => TMessage[],
      originalMessage: string,
    ): Promise<void> => {
      let attempt = 0;
      // Use mutable object so callback can set it and loop can read updated value
      const contentState = { hasReceived: false };

      retryAbortRef.current = new AbortController();

      const onMessageUpdate = (msgs: UIMessage[]) => {
        contentState.hasReceived = true;
        setMessages(msgs);
      };

      while (shouldRetry(attempt)) {
        try {
          const messageToSend = contentState.hasReceived
            ? "continue"
            : originalMessage;
          const stream = executeStream(messageToSend);

          await handleMessageStream(
            stream,
            adapter.formatMessages,
            onMessageUpdate,
          );
          setRateLimitState(null);

          return;
        } catch (error) {
          // Check if retry was aborted (using signal from loop-scoped controller)
          if (retryAbortRef.current.signal.aborted) {
            return;
          }

          const rateLimitInfo = detectRateLimit(error);

          if (!rateLimitInfo.isRateLimited || !shouldRetry(attempt + 1)) {
            // Not a rate limit error or no more retries - show error
            setMessages(adapter.createErrorMessage(error, getChatHistory()));
            setRateLimitState(null);

            return;
          }

          // Calculate delay and update state for UI
          const delayMs = calculateRetryDelay(
            attempt,
            rateLimitInfo.retryAfterMs,
          );

          setRateLimitState({
            isRetrying: true,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            delayMs,
          });

          // Wait before retrying
          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(resolve, delayMs);

            retryAbortRef.current?.signal.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              reject(new Error("Retry cancelled"));
            });
          });

          attempt++;
        }
      }
    },
    [adapter],
  );

  const handleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
      const userMessage = message.trim();

      if (!userMessage) return;

      if (!apiKey) {
        const userMessageEntry = adapter.createUserMessage(userMessage);

        setMessages(
          adapter.createErrorMessage(
            new Error(
              "No API key configured. Please add your API key in Settings.",
            ),
            [userMessageEntry],
          ),
        );

        return;
      }

      setIsAssistantResponding(true);

      try {
        if (!clientRef.current) {
          await initializeChat(undefined, options);
        }

        const client = clientRef.current;

        if (!client) {
          throw new Error("Failed to initialize chat client");
        }

        const controller = new AbortController();

        abortControllerRef.current = controller;

        await executeWithRetry(
          (msg) => client.sendMessage(msg, controller.signal, options),
          () => client.chatHistory,
          userMessage,
        );
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(
            error,
            clientRef.current?.chatHistory ?? [],
          ),
        );
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [apiKey, initializeChat, adapter, executeWithRetry],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      if (!apiKey) return;

      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      if (!clientRef.current) return;

      const rawIndex = message.rawHistoryIndex;
      const rawMessage = clientRef.current.chatHistory[rawIndex];

      if (!rawMessage) return;

      // Extract the user message text using adapter
      const userMessage = adapter.extractUserMessage(rawMessage);

      if (!userMessage) return;

      setIsAssistantResponding(true);

      try {
        // Slice history to exclude this message and everything after
        const slicedHistory = clientRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        // Client is guaranteed to be set after successful initialization
        const client = clientRef.current as NonNullable<
          typeof clientRef.current
        >;

        const controller = new AbortController();

        abortControllerRef.current = controller;

        await executeWithRetry(
          (msg) => client.sendMessage(msg, controller.signal),
          () => client.chatHistory,
          userMessage,
        );
      } catch (error) {
        // Client was checked before try block, so it's always defined here
        setMessages(
          adapter.createErrorMessage(error, clientRef.current.chatHistory),
        );
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [apiKey, messages, initializeChat, adapter, executeWithRetry],
  );

  return {
    messages,
    isAssistantResponding,
    activeModel,
    activeProvider,
    activeThinking,
    activeTemperature,
    rateLimitState,
    handleSend,
    handleRetry,
    clearConversation,
    stopResponse,
  };
}
