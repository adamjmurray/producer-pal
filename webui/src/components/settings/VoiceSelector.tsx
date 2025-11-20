interface VoiceSelectorProps {
  voice: string;
  setVoice: (voice: string) => void;
}

/**
 * Voice selector component for Gemini text-to-speech
 * @param {VoiceSelectorProps} props - Component props
 * @param {string} props.voice - Selected voice name
 * @param {(voice: string) => void} props.setVoice - Callback to update voice
 * @returns {JSX.Element} Voice selector component
 */
export function VoiceSelector({ voice, setVoice }: VoiceSelectorProps) {
  return (
    <div>
      <label htmlFor="voice-select" className="block text-sm mb-2">
        Voice (for voice chat)
      </label>
      <select
        id="voice-select"
        value={voice}
        onChange={(e) => setVoice((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
      >
        <option value="">Default</option>
        <option value="Puck">Puck</option>
        <option value="Charon">Charon</option>
        <option value="Kore">Kore</option>
        <option value="Fenrir">Fenrir</option>
        <option value="Aoede">Aoede</option>
      </select>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Choose a voice for Gemini voice chat responses
      </p>
    </div>
  );
}
