// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { DEFAULT_TURN_DETECTION } from "#webui/hooks/settings/turn-detection-helpers";

/**
 * Build the shared VoiceSettings prop block (voice, language, volume, speed,
 * turn detection, active voice) with fresh vi.fn() setters per call so tests
 * don't share spy state. Spread into a larger props object as needed.
 * @returns Voice-settings props with fresh mock setters
 */
export function makeVoiceSettingsProps(): {
  realtimeVoice: string;
  setRealtimeVoice: (voice: string) => void;
  voiceLanguage: string;
  setVoiceLanguage: (language: string) => void;
  voiceVolume: number;
  setVoiceVolume: (volume: number) => void;
  voiceSpeed: number;
  setVoiceSpeed: (speed: number) => void;
  turnDetection: typeof DEFAULT_TURN_DETECTION;
  setTurnDetection: (settings: typeof DEFAULT_TURN_DETECTION) => void;
  activeVoice: string | null;
} {
  return {
    realtimeVoice: "marin",
    setRealtimeVoice: vi.fn(),
    voiceLanguage: "en",
    setVoiceLanguage: vi.fn(),
    voiceVolume: 1.0,
    setVoiceVolume: vi.fn(),
    voiceSpeed: 1.0,
    setVoiceSpeed: vi.fn(),
    turnDetection: DEFAULT_TURN_DETECTION,
    setTurnDetection: vi.fn(),
    activeVoice: null as string | null,
  };
}
