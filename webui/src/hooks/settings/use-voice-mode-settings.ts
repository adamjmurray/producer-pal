// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import {
  loadRealtimeVoice,
  loadVoiceSpeed,
  saveRealtimeVoice,
  saveVoiceSpeed,
} from "#webui/hooks/settings/settings-helpers";

export interface UseVoiceModeSettingsReturn {
  realtimeVoice: string;
  setRealtimeVoice: (voice: string) => void;
  savedRealtimeVoice: string;
  voiceSpeed: number;
  setVoiceSpeed: (speed: number) => void;
  savedVoiceSpeed: number;
  /** Persist current voice-mode values and update the "saved" snapshots so
   * the live session reads the new values on the next connect. */
  commit: () => void;
  /** Discard in-modal edits, resetting the in-modal values back to what is
   * currently in localStorage. The saved snapshots already mirror localStorage,
   * so they are left untouched. */
  revert: () => void;
}

/**
 * Owns the voice-mode-only settings (voice id + playback speed). Kept
 * separate from the chat-side useSettings hook to keep that one under the
 * `max-lines-per-function` limit. The in-modal / saved split matches the
 * pattern useSettings uses for chat model: editing during a live session
 * doesn't reach into the RealtimeAgent, which reads the saved value at
 * connect time.
 *
 * @returns Voice settings state with commit/revert handlers
 */
export function useVoiceModeSettings(): UseVoiceModeSettingsReturn {
  const [realtimeVoice, setRealtimeVoiceState] =
    useState<string>(loadRealtimeVoice);
  const [savedRealtimeVoice, setSavedRealtimeVoice] =
    useState<string>(loadRealtimeVoice);
  const [voiceSpeed, setVoiceSpeedState] = useState<number>(loadVoiceSpeed);
  const [savedVoiceSpeed, setSavedVoiceSpeed] =
    useState<number>(loadVoiceSpeed);

  const commit = useCallback(() => {
    saveRealtimeVoice(realtimeVoice);
    saveVoiceSpeed(voiceSpeed);
    setSavedRealtimeVoice(realtimeVoice);
    setSavedVoiceSpeed(voiceSpeed);
  }, [realtimeVoice, voiceSpeed]);

  const revert = useCallback(() => {
    setRealtimeVoiceState(loadRealtimeVoice());
    setVoiceSpeedState(loadVoiceSpeed());
  }, []);

  return {
    realtimeVoice,
    setRealtimeVoice: setRealtimeVoiceState,
    savedRealtimeVoice,
    voiceSpeed,
    setVoiceSpeed: setVoiceSpeedState,
    savedVoiceSpeed,
    commit,
    revert,
  };
}
