import { useEffect } from "preact/hooks";
import { useVoiceChat } from "../../hooks/use-voice-chat.js";
import type { UIMessage } from "../../types/messages.js";

interface VoiceInputProps {
  apiKey: string;
  model?: string;
  temperature?: number;
  voice?: string;
  mcpUrl?: string;
  enabledTools?: Record<string, boolean>;
  onMessagesUpdate: (messages: UIMessage[]) => void;
  disabled?: boolean;
}

/**
 * Voice input component for voice chat functionality
 * @param props - Component properties
 * @param props.apiKey - Gemini API key
 * @param props.voice - Voice name for text-to-speech
 * @param props.mcpUrl - MCP server URL
 * @param props.enabledTools - Enabled MCP tools
 * @param props.onMessagesUpdate - Callback for messages updates
 * @param props.disabled - Whether the component is disabled
 * @returns {JSX.Element} Voice input button component
 */
export function VoiceInput({
  apiKey,
  voice,
  mcpUrl,
  enabledTools,
  onMessagesUpdate,
  disabled = false,
}: VoiceInputProps) {
  const {
    isConnected,
    isStreaming,
    error,
    messages,
    connect,
    startStreaming,
    stopStreaming,
  } = useVoiceChat(apiKey, voice, mcpUrl, enabledTools);

  // Update parent with message changes
  useEffect(() => {
    onMessagesUpdate(messages);
  }, [messages, onMessagesUpdate]);

  const handleToggle = async (): Promise<void> => {
    if (isStreaming) {
      stopStreaming();
    } else if (isConnected) {
      await startStreaming();
    } else {
      // Connect and then start streaming
      await connect();
      // Note: We'll need to click again to start streaming after connecting
      // This is intentional to give user control
    }
  };

  const buttonText = !isConnected ? "Connect" : isStreaming ? "Stop" : "Voice";

  const buttonClass = `px-4 py-2 rounded text-sm ${
    disabled
      ? "bg-gray-400 dark:bg-gray-700 cursor-not-allowed"
      : isStreaming
        ? "bg-red-600 hover:bg-red-700 text-white"
        : "bg-green-600 hover:bg-green-700 text-white"
  }`;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => void handleToggle()}
        disabled={disabled}
        className={buttonClass}
        title={
          !isConnected
            ? "Connect to voice chat"
            : isStreaming
              ? "Stop voice input"
              : "Start voice input"
        }
      >
        {isStreaming && (
          <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        )}
        {buttonText}
      </button>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 p-2 bg-red-100 dark:bg-red-900/20 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
