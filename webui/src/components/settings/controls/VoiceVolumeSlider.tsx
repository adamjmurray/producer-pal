// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";

export interface VoiceVolumeSliderProps {
  volume: number;
  setVolume: (volume: number) => void;
}

/**
 * Slider for the OpenAI Realtime output playback volume (1.0 = unity, up to
 * 1.25). Driven through a Web Audio GainNode so it can boost above unity, and
 * adjusts loudness live during a session — useful for balancing the assistant
 * against the music from Ableton.
 *
 * @param props - Component props
 * @param props.volume - Current volume (0.0–1.25)
 * @param props.setVolume - Setter for the in-modal volume value
 * @returns Voice volume slider element
 */
export function VoiceVolumeSlider({
  volume,
  setVolume,
}: VoiceVolumeSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="voice-volume-slider" className="text-sm">
          Volume ({Math.round(volume * 100)}%)
        </label>
        <button
          type="button"
          onClick={() => setVolume(VOICE_VOLUME_DEFAULT)}
          className="text-xs underline text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Reset
        </button>
      </div>
      <input
        id="voice-volume-slider"
        type="range"
        min={VOICE_VOLUME_MIN}
        max={VOICE_VOLUME_MAX}
        step={0.05}
        value={volume}
        onInput={(e) =>
          setVolume(Number.parseFloat((e.target as HTMLInputElement).value))
        }
        className="w-full"
        data-testid="voice-volume-slider"
      />
    </div>
  );
}
