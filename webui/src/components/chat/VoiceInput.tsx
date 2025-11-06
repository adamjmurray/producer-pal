import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { AudioRecorder } from "../../utils/audio-utils.js";
import {
  GeminiLiveClient,
  type GeminiLiveClientConfig,
} from "../../chat/gemini-live-client.js";

interface VoiceInputProps {
  apiKey: string;
  model: string;
  temperature: number;
  onTranscriptUpdate: (transcript: string) => void;
  disabled?: boolean;
}

export function VoiceInput({
  apiKey,
  model,
  temperature,
  onTranscriptUpdate,
  disabled = false,
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);

  const stopRecording = useCallback((): void => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    if (liveClientRef.current) {
      // Signal end of turn to get final response
      liveClientRef.current.endTurn();
      // Disconnect after a short delay to allow final response
      setTimeout(() => {
        liveClientRef.current?.disconnect();
        liveClientRef.current = null;
      }, 500);
    }

    setIsRecording(false);
    setIsConnecting(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const startRecording = async (): Promise<void> => {
    try {
      setError(null);
      setIsConnecting(true);
      setTranscript("");

      // Initialize Live API client
      const config: GeminiLiveClientConfig = {
        model,
        temperature,
        onTextResponse: (text: string) => {
          setTranscript((prev) => {
            const updated = prev + text;
            onTranscriptUpdate(updated);
            return updated;
          });
        },
        onError: (err: string) => {
          setError(err);
          stopRecording();
        },
        onConnected: () => {
          setIsConnecting(false);
        },
        onDisconnected: () => {
          stopRecording();
        },
      };

      liveClientRef.current = new GeminiLiveClient(apiKey, config);
      await liveClientRef.current.connect();

      // Start audio recording
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start((audioData: Int16Array) => {
        // Send audio chunks to Live API
        liveClientRef.current?.sendAudio(audioData);
      });

      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start recording",
      );
      setIsConnecting(false);
      stopRecording();
    }
  };

  const toggleRecording = (): void => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const buttonText = isConnecting
    ? "Connecting..."
    : isRecording
      ? "Stop"
      : "Voice";

  const buttonClass = `px-4 py-2 rounded ${
    disabled
      ? "bg-gray-400 dark:bg-gray-700 cursor-not-allowed"
      : isRecording
        ? "bg-red-600 hover:bg-red-700 text-white"
        : "bg-green-600 hover:bg-green-700 text-white"
  }`;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={toggleRecording}
        disabled={disabled || isConnecting}
        className={buttonClass}
        title={
          isRecording
            ? "Stop recording"
            : "Start voice input (requires microphone access)"
        }
      >
        {isRecording && (
          <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
        )}
        {buttonText}
      </button>

      {transcript && (
        <div className="text-sm text-gray-600 dark:text-gray-400 p-2 bg-gray-100 dark:bg-gray-800 rounded">
          <strong>Transcript:</strong> {transcript}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 p-2 bg-red-100 dark:bg-red-900/20 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
