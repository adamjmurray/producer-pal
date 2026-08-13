// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type Notation,
  NOTATION_LABELS,
  NOTATIONS,
} from "#src/shared/notation";
import { Tooltip } from "./Tooltip";

interface NotationSelectorProps {
  notation: Notation;
  setNotation: (notation: Notation) => void;
}

/**
 * Dropdown for the global notation setting — how the AI reads and writes clip
 * notes. Mirrors the server's config.notation (and the Max device Setup pane),
 * so it applies to all conversations going forward rather than being locked to
 * one chat.
 * @param props - Component props
 * @param props.notation - Currently selected notation
 * @param props.setNotation - Notation setter callback
 * @returns Notation selector element
 */
export function NotationSelector({
  notation,
  setNotation,
}: NotationSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="notation-select"
        className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-300"
      >
        Notation
        <Tooltip
          text={
            "How the AI reads and writes clip notes. " +
            "bar|beat (default): most expressive, best with capable models. " +
            "Stark: literal and compact, better for small or local models. " +
            "MIDI JSON: exact note data, best for coding agents and scripting. " +
            "Mirrors the device's Setup pane; applies to new conversations."
          }
        />
      </label>
      <select
        id="notation-select"
        value={notation}
        onChange={(e) =>
          setNotation((e.target as HTMLSelectElement).value as Notation)
        }
        className="w-full px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-sm"
        data-testid="notation-select"
      >
        {NOTATIONS.map((value) => (
          <option key={value} value={value}>
            {NOTATION_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
