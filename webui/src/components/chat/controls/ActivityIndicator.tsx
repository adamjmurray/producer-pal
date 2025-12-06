/**
 *
 * @returns {JSX.Element} - React component
 */
export function ActivityIndicator() {
  return (
    <div className="flex justify-center py-2">
      <SineWave />
    </div>
  );
}

/**
 *
 * @returns {JSX.Element} - React component
 */
function SineWave() {
  const width = 400;
  const height = 40;
  const amplitude1 = 7;
  const frequency1 = 5;
  const amplitude2 = 8;
  const frequency2 = 4;
  const points = 200;

  const pathData1 = generateSineWavePath(width, amplitude1, frequency1, points);
  const pathData2 = generateSineWavePath(width, amplitude2, frequency2, points);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style="overflow: visible;"
    >
      <defs>
        <filter id="blur">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1">
            <animate
              attributeName="stdDeviation"
              values="0;1.5;0"
              dur="2.9s"
              repeatCount="indefinite"
            />
          </feGaussianBlur>
        </filter>
        <style>
          {`
            @keyframes pulse1 {
              0%, 100% { transform: scaleY(1.3); }
              50% { transform: scaleY(0.5); }
            }

            @keyframes pulse2 {
              0%, 100% { transform: scaleY(1.4); }
              50% { transform: scaleY(0.4); }
            }

            @keyframes colorShift1 {
              0%, 100% { stroke: rgb(56, 189, 248); } /* sky-400 */
              50% { stroke: rgb(34, 197, 94); } /* green-500 */
            }

            @keyframes colorShift2 {
              0%, 100% { stroke: rgb(234, 179, 8); } /* yellow-600 */
              50% { stroke: rgb(249, 115, 22); } /* orange-500 */
            }

            .wave-path-1 {
              fill: none;
              stroke-width: 2.5;
              stroke-linecap: round;
              transform-origin: top left;
              animation:
                pulse1 3.72s ease-in-out infinite,
                colorShift1 4.19s ease-in-out infinite;
            }

            .wave-path-2 {
              fill: none;
              stroke-width: 2.5;
              stroke-linecap: round;
              transform-origin: top left;
              animation:
                pulse2 2.63s ease-in-out infinite,
                colorShift2 3.52s ease-in-out infinite;
            }
          `}
        </style>
      </defs>
      <g transform={`translate(0, ${height / 2})`} filter="url(#blur)">
        <path d={pathData1} className="wave-path-1" />
        <path d={pathData2} className="wave-path-2" />
        <circle cx="0" cy="0" r="2" className="wave-path-1" />
        <circle cx={width} cy="0" r="2" className="wave-path-2" />
      </g>
    </svg>
  );
}

/**
 * Generates an SVG path data string for a sine wave
 * @param {number} width - Width of the wave in pixels
 * @param {number} amplitude - Height of wave peaks
 * @param {number} frequency - Number of wave cycles
 * @param {number} points - Number of points to sample
 * @returns {JSX.Element} - React component
 */
function generateSineWavePath(
  width: number,
  amplitude: number,
  frequency: number,
  points: number,
): string {
  const step = width / points;
  let path = "";

  for (let i = 0; i <= points; i++) {
    const x = i * step;
    const y = amplitude * Math.sin((i / points) * frequency * 2 * Math.PI);

    path += `${i === 0 ? "M" : "L"} ${x},${y} `;
  }

  return path.trim();
}
