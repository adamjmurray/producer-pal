// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  loadEnabledTools,
  loadProviderSettings,
} from "#webui/hooks/settings/settings-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";
import { isFirefox } from "#webui/utils/browser-detect";
import { getMcpUrl } from "#webui/utils/mcp-url";
import { HistoryPane } from "./HistoryPane";

/**
 * Standalone Producer Pal voice page. Reuses the chat UI's localStorage
 * settings (OpenAI API key + per-tool enable map) and the MCP URL helper.
 *
 * @returns Voice prototype UI
 */
export function VoiceApp() {
  const mcpUrl = getMcpUrl();
  const voiceTokenUrl = mcpUrl.replace(/\/mcp$/, "/voice-token");

  const [openAiKey] = useState<string | null>(
    () => loadProviderSettings("openai").apiKey || null,
  );
  const enabledTools = useMemo(() => loadEnabledTools(), []);
  const firefoxDetected = useMemo(() => isFirefox(), []);

  const voice = useVoiceSession({
    mcpUrl,
    voiceTokenUrl,
    openAiKey,
    enabledTools,
  });

  const isBusy =
    voice.status === "connecting" || voice.status === "disconnecting";
  const isConnected = voice.status === "connected";
  const isUnsupportedBrowser = firefoxDetected;

  const onToggleConnection = () => {
    if (isConnected) {
      void voice.disconnect();
    } else {
      void voice.connect();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="w-full max-w-3xl px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Producer Pal Voice</h1>
        <a
          href="/chat"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Back to chat
        </a>
      </header>

      <main className="w-full max-w-3xl px-6 pb-12 flex-1 flex flex-col gap-6">
        {firefoxDetected && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 p-4 text-sm">
            <p className="font-medium mb-1">
              Firefox is not supported for voice.
            </p>
            <p>
              Voice currently works in Chrome (other Chromium browsers like Edge
              are likely fine but untested). Please open this page in Chrome.
            </p>
          </div>
        )}

        {!openAiKey && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 text-sm">
            <p className="font-medium mb-1">OpenAI API key required.</p>
            <p>
              Open the{" "}
              <a className="underline" href="/chat">
                chat UI
              </a>
              , set your OpenAI API key in settings, then reload this page.
            </p>
          </div>
        )}

        <VoiceControls
          voice={voice}
          openAiKey={openAiKey}
          isBusy={isBusy}
          isConnected={isConnected}
          isUnsupportedBrowser={isUnsupportedBrowser}
          onToggleConnection={onToggleConnection}
        />

        {voice.error && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700 p-3 text-sm space-y-2">
            <div>
              <span className="font-medium">Error: </span>
              {voice.error}
            </div>
            {voice.rateLimitedUntil != null && (
              <RateLimitRetry
                until={voice.rateLimitedUntil}
                onRetry={voice.retryResponse}
              />
            )}
          </div>
        )}

        <HistoryPane history={voice.history} />

        <p className="text-xs text-zinc-500">
          Transport events are logged to the browser console (filter:{" "}
          <code>[voice]</code>).
        </p>
      </main>
    </div>
  );
}

type VoiceSessionState = ReturnType<typeof useVoiceSession>;

interface VoiceControlsProps {
  voice: VoiceSessionState;
  openAiKey: string | null;
  isBusy: boolean;
  isConnected: boolean;
  isUnsupportedBrowser: boolean;
  onToggleConnection: () => void;
}

/**
 * The big Talk/Stop button plus the status badge and contextual secondary
 * action (Interrupt while the assistant is working, Mute otherwise).
 *
 * @param props - component props
 * @param props.voice - The useVoiceSession hook return value
 * @param props.openAiKey - User's OpenAI API key (controls disabled state)
 * @param props.isBusy - True during connecting/disconnecting transitions
 * @param props.isConnected - True when the realtime session is live
 * @param props.isUnsupportedBrowser - True when the browser is known broken (Firefox)
 * @param props.onToggleConnection - Toggle connect/disconnect
 * @returns Controls UI
 */
function VoiceControls({
  voice,
  openAiKey,
  isBusy,
  isConnected,
  isUnsupportedBrowser,
  onToggleConnection,
}: VoiceControlsProps) {
  const assistantActive = voice.assistantSpeaking || voice.assistantThinking;

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <button
        type="button"
        onClick={onToggleConnection}
        disabled={isBusy || !openAiKey || isUnsupportedBrowser}
        className={`
              w-32 h-32 rounded-full text-lg font-semibold transition-colors
              shadow-lg disabled:opacity-40 disabled:cursor-not-allowed
              ${
                isConnected
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            `}
      >
        {isBusy ? "..." : isConnected ? "Restart" : "Talk"}
      </button>
      <StatusBadge
        status={voice.status}
        assistantSpeaking={voice.assistantSpeaking}
        assistantThinking={voice.assistantThinking}
        userMuted={voice.isMuted}
      />
      {isConnected && assistantActive && (
        <button
          type="button"
          onClick={voice.interrupt}
          className="text-sm px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium shadow"
        >
          Interrupt
        </button>
      )}
      {isConnected && !assistantActive && (
        <button
          type="button"
          onClick={() => void voice.toggleMute()}
          className="text-sm px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {voice.isMuted ? "Unmute" : "Mute"}
        </button>
      )}
    </div>
  );
}

interface RateLimitRetryProps {
  until: number;
  onRetry: () => void;
}

/**
 * Countdown until an OpenAI rate-limit window expires, with a retry button
 * that becomes enabled when the countdown reaches zero.
 *
 * @param props - component props
 * @param props.until - Epoch ms when the rate limit clears
 * @param props.onRetry - Callback to nudge the model to generate the next response
 * @returns Countdown UI
 */
function RateLimitRetry({ until, onRetry }: RateLimitRetryProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, until - Date.now()),
  );

  useEffect(() => {
    setRemainingMs(Math.max(0, until - Date.now()));
    const id = setInterval(() => {
      const next = Math.max(0, until - Date.now());

      setRemainingMs(next);
      if (next === 0) clearInterval(id);
    }, 250);

    return () => clearInterval(id);
  }, [until]);

  const ready = remainingMs === 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">
        {ready ? "Ready to retry." : `Retry available in ${seconds}s…`}
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={!ready}
        className="text-sm px-3 py-1 rounded border border-red-400 dark:border-red-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-100 dark:hover:bg-red-900/40"
      >
        Retry
      </button>
    </div>
  );
}

interface StatusBadgeProps {
  status: string;
  assistantSpeaking: boolean;
  assistantThinking: boolean;
  userMuted: boolean;
}

/**
 * Connection-status indicator with mic-availability state. When connected,
 * differentiates between "you can talk now" and "wait — the model is working".
 *
 * @param props - component props
 * @param props.status - the voice session status string
 * @param props.assistantSpeaking - true while the model is producing audio
 * @param props.assistantThinking - true between response.created and response.done
 * @param props.userMuted - true when the user has explicitly muted their mic
 * @returns Status pill
 */
function StatusBadge({
  status,
  assistantSpeaking,
  assistantThinking,
  userMuted,
}: StatusBadgeProps) {
  const { label, color, pulse } = computeStatusVisuals({
    status,
    assistantSpeaking,
    assistantThinking,
    userMuted,
  });

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
      />
      {label}
    </div>
  );
}

const NEUTRAL_DOT = "bg-zinc-400";

/**
 * Map the connection + speaking + mute states into a single label/dot pair.
 *
 * @param state - status, assistantSpeaking, userMuted flags
 * @returns Label text, dot color class, and whether to pulse
 */
function computeStatusVisuals(state: StatusBadgeProps): {
  label: string;
  color: string;
  pulse: boolean;
} {
  if (state.status === "connecting") {
    return { label: "Connecting…", color: NEUTRAL_DOT, pulse: true };
  }

  if (state.status === "disconnecting") {
    return { label: "Disconnecting…", color: NEUTRAL_DOT, pulse: false };
  }

  if (state.status === "error") {
    return { label: "Error", color: "bg-red-500", pulse: false };
  }

  if (state.status !== "connected") {
    return { label: "Idle", color: NEUTRAL_DOT, pulse: false };
  }

  if (state.userMuted) {
    return { label: "Muted", color: "bg-zinc-500", pulse: false };
  }

  if (state.assistantSpeaking) {
    return {
      label: "Assistant speaking — wait",
      color: "bg-amber-500",
      pulse: true,
    };
  }

  if (state.assistantThinking) {
    return {
      label: "Thinking — wait",
      color: "bg-yellow-500",
      pulse: true,
    };
  }

  return {
    label: "Listening — go ahead",
    color: "bg-green-500",
    pulse: true,
  };
}
