// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";
import { REALTIME_VOICES } from "#webui/lib/constants/models";

export interface VoiceSelectorProps {
  voice: string;
  setVoice: (voice: string) => void;
  /** Voice currently locked into the live RealtimeSession, when one is active.
   * If set and different from `voice`, an inline notice explains that the
   * pending change applies on the next session. */
  activeVoice: string | null;
  /** Provider-appropriate voice options. Defaults to the OpenAI voices. */
  voices?: readonly { value: string; label: string }[];
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
 * @param props.voices - Provider-appropriate voice options (defaults to OpenAI)
 * @returns Voice selector element
 */
export function VoiceSelector({
  voice,
  setVoice,
  activeVoice,
  voices = REALTIME_VOICES,
}: VoiceSelectorProps) {
  // The saved voice can belong to the other provider (one shared field); show a
  // valid option from this provider's list so the dropdown isn't blank/wrong.
  const selected = voices.some((v) => v.value === voice)
    ? voice
    : (voices[0]?.value ?? voice);

  // Commit the displayed default back into state when the saved voice isn't in
  // this provider's list (typical after a mid-modal provider switch). Without
  // this, a Save without touching the dropdown would persist the stale
  // cross-provider voice — the dropdown displays voices[0] but never fires
  // setVoice, so the in-modal state still holds the old id.
  useEffect(() => {
    if (selected !== voice) setVoice(selected);
  }, [selected, voice, setVoice]);
  const pendingChange = activeVoice != null && activeVoice !== selected;

  return (
    <div>
      <label htmlFor="voice-select" className="block text-sm mb-2">
        Voice
      </label>
      <select
        id="voice-select"
        value={selected}
        onChange={(e) => setVoice((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
        data-testid="voice-select"
      >
        {voices.map(({ value, label }) => (
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
