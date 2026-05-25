// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MessageList } from "#webui/components/chat/MessageList";
import { type UIMessage } from "#webui/types/messages";

interface VoiceTranscriptProps {
  messages: UIMessage[];
  assistantThinking: boolean;
  isUnsupportedBrowser: boolean;
  hasVoiceKey: boolean;
  /** Active voice provider name ("OpenAI" | "Gemini") for the key-required copy. */
  providerName: string;
}

// Voice transcripts are read-only — the user can't edit past turns or retry
// individual responses (the underlying audio is gone). MessageList still
// requires these handlers; provide a shared no-op.
/* v8 ignore next 1 -- no-op for read-only voice transcript */
const noopAsync = async (): Promise<void> => undefined;

/**
 * Scrollable transcript area for the voice page. Renders the unsupported-browser
 * and missing-API-key warnings above the chat-style MessageList (or an empty-
 * state placeholder until the first turn arrives).
 *
 * @param props - component props
 * @param props.messages - Voice transcript rendered as chat UIMessages
 * @param props.assistantThinking - True between response.created and response.done
 * @param props.isUnsupportedBrowser - True when the browser can't drive the
 *   active backend (Firefox + OpenAI WebRTC; Gemini works in Firefox)
 * @param props.hasVoiceKey - True when the active provider's API key is set
 * @param props.providerName - Active voice provider name for the key copy
 * @returns Transcript section
 */
export function VoiceTranscript({
  messages,
  assistantThinking,
  isUnsupportedBrowser,
  hasVoiceKey,
  providerName,
}: VoiceTranscriptProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 flex flex-col gap-4">
      {isUnsupportedBrowser && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 p-4 text-sm">
          <p className="font-medium mb-1">
            Firefox is not supported for this voice provider.
          </p>
          <p>
            OpenAI voice currently works in Chrome (other Chromium browsers like
            Edge are likely fine but untested). Please open this page in Chrome,
            or use the Gemini voice provider, which works in Firefox.
          </p>
        </div>
      )}

      {!hasVoiceKey && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 text-sm">
          <p className="font-medium mb-1">{providerName} API key required.</p>
          <p>
            Open Settings, select the {providerName} provider, and paste your
            API key.
          </p>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="text-sm text-zinc-500 text-center py-8">
          Conversation will appear here once you start talking.
        </div>
      ) : (
        <MessageList
          messages={messages}
          isAssistantResponding={assistantThinking}
          handleRetry={noopAsync}
          handleEdit={noopAsync}
          showTimestamps={false}
          showTokenUsage={false}
        />
      )}
    </div>
  );
}
