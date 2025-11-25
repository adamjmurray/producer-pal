import { useState } from "preact/hooks";
import type { VoiceStatus } from "#webui/hooks/voice/use-voice-chat";

interface ChatInputProps {
  handleSend: (message: string) => Promise<void>;
  isAssistantResponding: boolean;
  onStop: () => void;
  // Voice chat props (optional)
  voiceEnabled?: boolean;
  voiceStatus?: VoiceStatus;
  onVoiceConnect?: () => void;
  onVoiceDisconnect?: () => void;
}

/**
 * Input component for chat messages
 * @param {ChatInputProps} root0 - Component props
 * @param {(message: string) => Promise<void>} root0.handleSend - Callback to send message
 * @param {boolean} root0.isAssistantResponding - Whether assistant is currently responding
 * @param {() => void} root0.onStop - Callback to stop assistant response
 * @param {boolean} root0.voiceEnabled - Whether voice chat is enabled
 * @param {VoiceStatus} root0.voiceStatus - Current voice connection status
 * @param {() => void} root0.onVoiceConnect - Callback to start voice session
 * @param {() => void} root0.onVoiceDisconnect - Callback to end voice session
 * @returns {JSX.Element} - React component
 */
export function ChatInput({
  handleSend,
  isAssistantResponding,
  onStop,
  voiceEnabled = false,
  voiceStatus = "disconnected",
  onVoiceConnect,
  onVoiceDisconnect,
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isAssistantResponding && input.trim()) {
        void handleSend(input);
        setInput("");
      }
    }
  };

  const handleSendClick = () => {
    void handleSend(input);
    setInput("");
  };

  const handleMicClick = () => {
    if (voiceStatus === "connected") {
      onVoiceDisconnect?.();
    } else if (voiceStatus === "disconnected") {
      onVoiceConnect?.();
    }
  };

  const getMicButtonStyles = () => {
    if (voiceStatus === "connected") {
      return "bg-green-600 text-white hover:bg-green-700";
    }
    if (voiceStatus === "connecting") {
      return "bg-yellow-500 text-white animate-pulse cursor-wait";
    }
    return "bg-gray-500 text-white hover:bg-gray-600";
  };

  const getMicButtonTitle = () => {
    if (voiceStatus === "connected")
      return "Voice active - click to disconnect";
    if (voiceStatus === "connecting") return "Connecting...";
    return "Start voice chat";
  };

  return (
    <div className="border-t border-gray-300 dark:border-gray-700 p-4">
      <div className="flex gap-3">
        <textarea
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for new line)"
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded resize-none placeholder:dark:text-gray-400 placeholder:text-gray-500"
          rows={2}
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={onStop}
            disabled={!isAssistantResponding}
            className={`px-4 py-1 rounded text-sm ${isAssistantResponding ? "bg-orange-600 text-white hover:bg-orange-700" : "invisible"}`}
          >
            Stop
          </button>
          <div className="flex gap-2">
            {voiceEnabled && (
              <button
                onClick={handleMicClick}
                disabled={voiceStatus === "connecting" || isAssistantResponding}
                title={getMicButtonTitle()}
                className={`px-3 py-2 rounded disabled:opacity-50 ${getMicButtonStyles()}`}
              >
                <MicIcon />
              </button>
            )}
            <button
              onClick={handleSendClick}
              disabled={isAssistantResponding || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
            >
              {isAssistantResponding ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Microphone icon component
 * @returns {JSX.Element} SVG icon
 */
function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
