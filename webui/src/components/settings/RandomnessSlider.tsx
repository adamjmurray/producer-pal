interface RandomnessSliderProps {
  temperature: number;
  setTemperature: (temp: number) => void;
}

/**
 *
 * @param root0
 * @param root0.temperature
 * @param root0.setTemperature
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
