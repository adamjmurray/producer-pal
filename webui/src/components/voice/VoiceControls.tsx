// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type useVoiceSession } from "#webui/hooks/voice/use-voice-session";

type VoiceSessionState = ReturnType<typeof useVoiceSession>;

interface VoiceControlsProps {
  voice: VoiceSessionState;
  openAiKey: string | null;
  isBusy: boolean;
  isConnected: boolean;
  isUnsupportedBrowser: boolean;
  onToggleConnection: () => void;
  /** User's saved voice preference (post-save). Compared against the live
   * session's `activeVoice` to render the pending-change indicator. */
  savedVoice: string;
}

/**
 * Composer-area voice controls: Talk/Stop button, status badge, and the
 * contextual secondary action (Interrupt while the assistant is working, Mute
 * otherwise). Rendered in the composer slot of AppShell so it sits where the
 * chat ChatInput would.
 *
 * @param props - component props
 * @param props.voice - The useVoiceSession hook return value
 * @param props.openAiKey - User's OpenAI API key (controls disabled state)
 * @param props.isBusy - True during connecting/disconnecting transitions
 * @param props.isConnected - True when the realtime session is live
 * @param props.isUnsupportedBrowser - True when the browser is known broken (Firefox)
 * @param props.onToggleConnection - Toggle connect/disconnect
 * @param props.savedVoice - User's saved realtime voice preference (post-save)
 * @returns Controls UI
 */
export function VoiceControls({
  voice,
  openAiKey,
  isBusy,
  isConnected,
  isUnsupportedBrowser,
  onToggleConnection,
  savedVoice,
}: VoiceControlsProps) {
  const assistantActive = voice.assistantSpeaking || voice.assistantThinking;
  const activeVoice = voice.activeVoice;
  const voiceDiverges = activeVoice != null && activeVoice !== savedVoice;
  const displayVoice = activeVoice ?? savedVoice;

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-4 border-t border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggleConnection}
        disabled={isBusy || !openAiKey || isUnsupportedBrowser}
        className={`
              w-24 h-24 rounded-full text-base font-semibold transition-colors
              shadow-lg disabled:opacity-40 disabled:cursor-not-allowed
              ${
                isConnected
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            `}
      >
        {isBusy ? "..." : isConnected ? "Stop" : "Talk"}
      </button>
      <StatusBadge
        status={voice.status}
        assistantSpeaking={voice.assistantSpeaking}
        assistantThinking={voice.assistantThinking}
        userMuted={voice.isMuted}
      />
      <VoiceLabel
        displayVoice={displayVoice}
        voiceDiverges={voiceDiverges}
        savedVoice={savedVoice}
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

interface VoiceLabelProps {
  displayVoice: string;
  voiceDiverges: boolean;
  savedVoice: string;
}

/**
 * Small caption showing the active voice. Renders in amber when the live
 * session's voice diverges from the user's saved selection (a mid-session
 * settings edit), with a tooltip that explains the change applies on the
 * next Stop → Talk.
 *
 * @param props - Component props
 * @param props.displayVoice - The voice id to display (live if active, else saved)
 * @param props.voiceDiverges - Whether the saved preference differs from the live session voice
 * @param props.savedVoice - Saved voice preference (shown in the tooltip)
 * @returns Voice label element
 */
function VoiceLabel({
  displayVoice,
  voiceDiverges,
  savedVoice,
}: VoiceLabelProps) {
  return (
    <div
      className={`text-xs ${
        voiceDiverges
          ? "text-amber-600 dark:text-amber-400"
          : "text-zinc-500 dark:text-zinc-400"
      }`}
      title={
        voiceDiverges
          ? `Voice change to "${savedVoice}" applies on next session (Stop, then Talk)`
          : undefined
      }
    >
      Voice: {displayVoice}
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
