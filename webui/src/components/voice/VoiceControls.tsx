// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ThinkingToggle } from "#webui/components/chat/controls/ThinkingToggle";
import { type useVoiceSession } from "#webui/hooks/voice/use-voice-session";

type VoiceSessionState = ReturnType<typeof useVoiceSession>;

interface VoiceControlsProps {
  voice: VoiceSessionState;
  /** Active provider's API key (OpenAI or Gemini); null disables Talk. */
  voiceKey: string | null;
  isBusy: boolean;
  isConnected: boolean;
  isUnsupportedBrowser: boolean;
  onToggleConnection: () => void;
  /** User's saved voice preference (post-save). Compared against the live
   * session's `activeVoice` to render the pending-change indicator. */
  savedVoice: string;
  thinking: string;
  onThinkingChange: (thinking: string) => void;
}

/**
 * Composer-area voice controls laid out like the chat composer: status + voice
 * info on the left, ThinkingToggle and Talk/Stop on the right. Mute/Interrupt
 * is a contextual inline button next to the primary action when connected.
 *
 * @param props - component props
 * @param props.voice - The voice session hook return value (OpenAI or Gemini)
 * @param props.voiceKey - Active provider's API key (controls disabled state)
 * @param props.isBusy - True during connecting/disconnecting transitions
 * @param props.isConnected - True when the realtime session is live
 * @param props.isUnsupportedBrowser - True when the browser can't drive the
 *   active backend (Firefox + OpenAI WebRTC)
 * @param props.onToggleConnection - Toggle connect/disconnect
 * @param props.savedVoice - User's saved realtime voice preference (post-save)
 * @param props.thinking - Current thinking level
 * @param props.onThinkingChange - Callback when thinking level changes
 * @returns Controls UI
 */
export function VoiceControls({
  voice,
  voiceKey,
  isBusy,
  isConnected,
  isUnsupportedBrowser,
  onToggleConnection,
  savedVoice,
  thinking,
  onThinkingChange,
}: VoiceControlsProps) {
  const assistantActive = voice.assistantSpeaking || voice.assistantThinking;
  const activeVoice = voice.activeVoice;
  const voiceDiverges = activeVoice != null && activeVoice !== savedVoice;
  const displayVoice = activeVoice ?? savedVoice;

  return (
    <div className="relative z-10 border-t border-zinc-300 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.3)]">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <VoiceLabel
              displayVoice={displayVoice}
              voiceDiverges={voiceDiverges}
              savedVoice={savedVoice}
            />
            <div className="flex min-w-0 flex-1 justify-center">
              <StatusBadge
                status={voice.status}
                assistantSpeaking={voice.assistantSpeaking}
                assistantThinking={voice.assistantThinking}
                userMuted={voice.isMuted}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && assistantActive && (
              <button
                type="button"
                onClick={voice.interrupt}
                className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-amber-600"
              >
                Interrupt
              </button>
            )}
            {isConnected && !assistantActive && (
              <button
                type="button"
                onClick={() => void voice.toggleMute()}
                className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {voice.isMuted ? "Unmute" : "Mute"}
              </button>
            )}
            <ThinkingToggle
              thinking={thinking}
              onThinkingChange={onThinkingChange}
            />
            <button
              type="button"
              onClick={onToggleConnection}
              // Only require a key to START a session — once connected, Stop
              // must stay enabled even if the user clears or switches the active
              // provider key, so they can always tear the mic/socket down.
              disabled={
                isBusy || isUnsupportedBrowser || (!isConnected && !voiceKey)
              }
              className={`rounded-lg px-6 py-2 text-base font-semibold shadow transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isConnected
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isBusy ? "..." : isConnected ? "Stop" : "Talk"}
            </button>
          </div>
        </div>
      </div>
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
      className={`text-sm ${
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
    <div className="flex items-center gap-2 text-base text-zinc-600 dark:text-zinc-400">
      <span
        className={`inline-block h-3 w-3 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
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
