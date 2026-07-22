// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import {
  loadRealtimeVoice,
  loadVoiceLanguage,
  loadVoiceSpeed,
  loadVoiceVolume,
  saveRealtimeVoice,
  saveVoiceLanguage,
  saveVoiceSpeed,
  saveVoiceVolume,
} from "#webui/hooks/settings/settings-helpers";
import {
  loadTurnDetection,
  saveTurnDetection,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";
import { type VoiceModeSettingsFields } from "#webui/types/settings";

export interface UseVoiceModeSettingsReturn extends VoiceModeSettingsFields {
  /** Persist current voice-mode values and update the "saved" snapshots so
   * the live session reads the new values on the next connect. */
  commit: () => void;
  /** Discard in-modal edits, resetting the in-modal values back to what is
   * currently in localStorage. The saved snapshots already mirror localStorage,
   * so they are left untouched. */
  revert: () => void;
}

/**
 * Owns the voice-mode-only settings (voice id, playback speed, output volume,
 * turn detection). Kept
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
  const [voiceVolume, setVoiceVolumeState] = useState<number>(loadVoiceVolume);
  const [turnDetection, setTurnDetectionState] =
    useState<TurnDetectionSettings>(loadTurnDetection);
  const [savedTurnDetection, setSavedTurnDetection] =
    useState<TurnDetectionSettings>(loadTurnDetection);
  const [voiceLanguage, setVoiceLanguageState] =
    useState<string>(loadVoiceLanguage);
  const [savedVoiceLanguage, setSavedVoiceLanguage] =
    useState<string>(loadVoiceLanguage);

  const commit = useCallback(() => {
    saveRealtimeVoice(realtimeVoice);
    saveVoiceSpeed(voiceSpeed);
    saveVoiceVolume(voiceVolume);
    saveTurnDetection(turnDetection);
    saveVoiceLanguage(voiceLanguage);
    setSavedRealtimeVoice(realtimeVoice);
    setSavedVoiceSpeed(voiceSpeed);
    setSavedTurnDetection(turnDetection);
    setSavedVoiceLanguage(voiceLanguage);
  }, [realtimeVoice, voiceSpeed, voiceVolume, turnDetection, voiceLanguage]);

  const revert = useCallback(() => {
    setRealtimeVoiceState(loadRealtimeVoice());
    setVoiceSpeedState(loadVoiceSpeed());
    setVoiceVolumeState(loadVoiceVolume());
    setTurnDetectionState(loadTurnDetection());
    setVoiceLanguageState(loadVoiceLanguage());
  }, []);

  return {
    realtimeVoice,
    setRealtimeVoice: setRealtimeVoiceState,
    savedRealtimeVoice,
    voiceSpeed,
    setVoiceSpeed: setVoiceSpeedState,
    savedVoiceSpeed,
    voiceVolume,
    setVoiceVolume: setVoiceVolumeState,
    turnDetection,
    setTurnDetection: setTurnDetectionState,
    savedTurnDetection,
    voiceLanguage,
    setVoiceLanguage: setVoiceLanguageState,
    savedVoiceLanguage,
    commit,
    revert,
  };
}
