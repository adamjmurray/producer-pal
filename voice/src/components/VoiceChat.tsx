import { useState } from 'react';
import { useVoiceChat } from '../hooks/useVoiceChat';
import { GEMINI_VOICES, DEFAULT_VOICE, type GeminiVoice } from '../constants/voices';

interface VoiceChatProps {
  apiKey: string;
  onOpenSettings: () => void;
}

export function VoiceChat({ apiKey, onOpenSettings }: VoiceChatProps) {
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoice>(DEFAULT_VOICE);

  const {
    isConnected,
    isStreaming,
    error,
    transcription,
    connect,
    startStreaming,
    stopStreaming,
    debug,
    verboseLogging,
    setVerboseLogging,
  } = useVoiceChat(apiKey, selectedVoice);

  if (!apiKey) {
    return (
      <div className="h-full bg-gradient-to-br from-blue-100 to-purple-200 dark:from-slate-950 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            API Key Required
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Please configure your Gemini API key to start using voice chat.
          </p>
          <button
            onClick={onOpenSettings}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-base rounded-lg font-medium transition-colors cursor-pointer"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gradient-to-br from-blue-100 to-purple-200 dark:from-slate-950 dark:to-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                Voice Chat
              </h1>
              {isConnected && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <div className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full" />
                  Connected
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <label
                htmlFor="voice-select"
                className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline"
              >
                Voice:
              </label>
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value as GeminiVoice)}
                disabled={isConnected}
                className="px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {GEMINI_VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={onOpenSettings}
              className="px-4 py-2.5 text-sm md:text-base text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors cursor-pointer"
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 flex items-center justify-center">
        <div className="max-w-4xl w-full">
          {!isConnected ? (
            <div className="text-center py-12">
              <div className="inline-block p-6 bg-white dark:bg-gray-700 rounded-full shadow-lg mb-4">
                <svg
                  className="w-12 h-12 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                Ready to start?
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                Connect to start your voice conversation with Gemini
              </p>
              <button
                onClick={connect}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-base rounded-lg font-medium transition-colors cursor-pointer"
              >
                Connect
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Transcription Display */}
              {transcription && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-6 shadow-md">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    Conversation:
                  </h3>
                  <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                    {transcription}
                  </p>
                </div>
              )}

              {/* Hands-Free Control */}
              <div className="text-center">
                <div className="mb-4">
                  {isStreaming ? (
                    <div className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                      <div className="w-3 h-3 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                      Conversation Active - Just speak naturally
                    </div>
                  ) : (
                    <div className="text-gray-600 dark:text-gray-400">
                      Start conversation to talk with AI
                    </div>
                  )}
                </div>

                <button
                  onClick={isStreaming ? stopStreaming : startStreaming}
                  aria-label={isStreaming ? 'Stop conversation' : 'Start conversation'}
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isStreaming
                      ? 'bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600'
                      : 'bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600'
                  }`}
                >
                  {isStreaming ? (
                    <svg
                      className="w-16 h-16 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="6" y="6" width="12" height="12" />
                    </svg>
                  ) : (
                    <svg
                      className="w-16 h-16 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  )}
                </button>

                <div className="mt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isStreaming ? 'Click to stop' : 'Click to start'}
                  </p>
                  {isStreaming && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                      You can interrupt the AI anytime - just start speaking!
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg mt-4">
              <strong className="font-bold">Error: </strong>
              <span>{error}</span>
            </div>
          )}

          {/* Verbose Logging Checkbox */}
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={verboseLogging}
                onChange={(e) => setVerboseLogging(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
              />
              <span>Enable verbose logging</span>
            </label>
          </div>

          {/* Debug Display */}
          {verboseLogging && debug && (
            <div className="bg-yellow-100 dark:bg-yellow-900 border border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg mt-4">
              <strong className="font-bold text-sm">Debug Info:</strong>
              <pre className="text-xs mt-2 whitespace-pre-wrap font-mono">{debug}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
