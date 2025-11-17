import { useEffect } from "preact/hooks";
import { useVoiceChat } from "../../hooks/use-voice-chat.js";

interface VoiceInputProps {
  apiKey: string;
  model?: string;
  temperature?: number;
  onTranscriptUpdate: (transcript: string) => void;
  disabled?: boolean;
}

export function VoiceInput({
  apiKey,
  onTranscriptUpdate,
  disabled = false,
}: VoiceInputProps) {
  const {
    isConnected,
    isStreaming,
    error,
    transcription,
    connect,
    startStreaming,
    stopStreaming,
  } = useVoiceChat(apiKey);

  // Update parent with transcription changes
  useEffect(() => {
    if (transcription) {
      onTranscriptUpdate(transcription);
    }
  }, [transcription, onTranscriptUpdate]);

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
