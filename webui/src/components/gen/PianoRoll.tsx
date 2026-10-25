// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ClipNote } from "#webui/lib/utils/gen-ui/read-clip";

const BEATS_PER_BAR = 4;
const MIN_PITCH_SPAN = 12;
const WIDTH = 320;
const HEIGHT = 120;

/**
 * A bare-bones piano roll: one rectangle per note, brighter when louder.
 * @param props - Component props
 * @param props.notes - The clip's notes
 * @param props.lengthBeats - The clip's length in beats, if known
 * @returns SVG element
 */
export function PianoRoll({
  notes,
  lengthBeats,
}: {
  notes: ClipNote[];
  lengthBeats?: number;
}): preact.JSX.Element {
  if (notes.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-zinc-500">No notes</div>
    );
  }

  const lowest = Math.min(...notes.map((n) => n.p));
  const highest = Math.max(...notes.map((n) => n.p));
  const span = Math.max(highest - lowest + 1, MIN_PITCH_SPAN);
  const end = Math.max(...notes.map((n) => n.t + n.d));
  const beats = Math.max(
    lengthBeats ?? 0,
    Math.ceil(end / BEATS_PER_BAR) * BEATS_PER_BAR,
  );
  const noteHeight = HEIGHT / span;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full rounded bg-zinc-100 dark:bg-zinc-800"
      role="img"
      aria-label={`${notes.length} notes`}
    >
      {Array.from(
        { length: Math.floor(beats / BEATS_PER_BAR) + 1 },
        (_, bar) => (
          <line
            key={bar}
            x1={(bar * BEATS_PER_BAR * WIDTH) / beats}
            x2={(bar * BEATS_PER_BAR * WIDTH) / beats}
            y1={0}
            y2={HEIGHT}
            className="stroke-zinc-300 dark:stroke-zinc-600"
            stroke-width={0.5}
          />
        ),
      )}
      {notes.map((n, i) => (
        <rect
          key={i}
          data-note={n.p}
          x={(n.t * WIDTH) / beats}
          y={(highest - n.p) * noteHeight}
          width={Math.max((n.d * WIDTH) / beats, 1)}
          height={Math.max(noteHeight - 0.5, 1)}
          className="fill-indigo-500"
          opacity={0.35 + (0.65 * Math.min(n.v, 127)) / 127}
        />
      ))}
    </svg>
  );
}
