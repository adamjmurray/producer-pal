// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
} from "#webui/hooks/settings/settings-helpers";

export interface VoiceSpeedSliderProps {
  speed: number;
  setSpeed: (speed: number) => void;
}

/**
 * Slider for the OpenAI Realtime output playback speed multiplier (1.0 =
 * normal). Applied at session start — mid-session edits take effect on the
 * next Stop → Talk.
 *
 * @param props - Component props
 * @param props.speed - Current speed multiplier
 * @param props.setSpeed - Setter for the in-modal speed value
 * @returns Voice speed slider element
 */
export function VoiceSpeedSlider({ speed, setSpeed }: VoiceSpeedSliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="voice-speed-slider" className="text-sm">
          Speed ({speed.toFixed(2)}x)
        </label>
        <button
          type="button"
          onClick={() => setSpeed(VOICE_SPEED_DEFAULT)}
          className="text-xs underline text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Reset
        </button>
      </div>
      <input
        id="voice-speed-slider"
        type="range"
        min={VOICE_SPEED_MIN}
        max={VOICE_SPEED_MAX}
        step={0.05}
        value={speed}
        onInput={(e) =>
          setSpeed(Number.parseFloat((e.target as HTMLInputElement).value))
        }
        className="w-full"
        data-testid="voice-speed-slider"
      />
    </div>
  );
}
