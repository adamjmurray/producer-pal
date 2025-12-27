interface RandomnessSliderProps {
  temperature: number;
  setTemperature: (temp: number) => void;
}

/**
 * Slider for adjusting temperature/randomness
 * @param {RandomnessSliderProps} props - Component props
 * @param {number} props.temperature - Current temperature value (0-2)
 * @param {(temp: number) => void} props.setTemperature - Temperature setter callback
 * @returns {JSX.Element} - React component
 */
export function RandomnessSlider({
  temperature,
  setTemperature,
}: RandomnessSliderProps) {
  return (
    <div>
      <label className="block text-sm mb-2">
        Randomness: {Math.round((temperature / 2) * 100)}%
      </label>
      <input
        type="range"
        min="0"
        max="2"
        step="0.1"
        value={temperature}
        onInput={(e) =>
          setTemperature(parseFloat((e.target as HTMLInputElement).value))
        }
        className="w-full"
      />
    </div>
  );
}
