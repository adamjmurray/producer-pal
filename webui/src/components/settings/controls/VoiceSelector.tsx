// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { REALTIME_VOICES } from "#webui/lib/constants/models";

export interface VoiceSelectorProps {
  voice: string;
  setVoice: (voice: string) => void;
  /** Voice currently locked into the live RealtimeSession, when one is active.
   * If set and different from `voice`, an inline notice explains that the
   * pending change applies on the next session. */
  activeVoice: string | null;
}

/**
 * Realtime voice selection dropdown. Always editable; an inline notice
 * surfaces when an in-flight voice session is using a different voice than
 * the saved selection (the change applies on the next Stop → Talk).
 *
 * @param props - Component props
 * @param props.voice - Currently selected voice id
 * @param props.setVoice - Setter for the in-modal voice value
 * @param props.activeVoice - Voice baked into the live session (or null when idle)
 * @returns Voice selector element
 */
export function VoiceSelector({
  voice,
  setVoice,
  activeVoice,
}: VoiceSelectorProps) {
  const pendingChange = activeVoice != null && activeVoice !== voice;

  return (
    <div>
      <label htmlFor="voice-select" className="block text-sm mb-2">
        Voice
      </label>
      <select
        id="voice-select"
        value={voice}
        onChange={(e) => setVoice((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
        data-testid="voice-select"
      >
        {REALTIME_VOICES.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {pendingChange && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Active session is using "{activeVoice}". Voice change applies on the
          next session (Stop, then Talk).
        </p>
      )}
    </div>
  );
}
