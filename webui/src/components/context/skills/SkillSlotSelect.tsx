// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SkillSlotView } from "#webui/hooks/context/use-skill-overrides";

interface SkillSlotSelectProps {
  slots: SkillSlotView[];
  selected: string;
  onSelect: (name: string) => void;
}

/**
 * Dropdown that picks which skills fragment to edit.
 *
 * Options are labelled by FILENAME, not by the human title: the same name an
 * `@include "./devices.md"` line names and the same file the override is written
 * to in `~/.producer-pal/skills/`. Titles restate the filename for most
 * fragments ("arrangement.md" / "Arrangement"), so listing both would pad every
 * row to buy clarity on the handful — the small-model ones — where the filename
 * really is opaque. Those get the title from the option's tooltip here, and the
 * controls strip shows it in full for the selected slot.
 *
 * Each option is glyph-marked so the whole set's state is visible without
 * clicking through: "✕" when the fragment is switched off, "⚠" when the built-in
 * changed since the override was forked (drift), "✎" when customized and in
 * sync, and unmarked when the slot tracks the built-in.
 * @param props - Select props
 * @returns Select element
 */
export function SkillSlotSelect(
  props: SkillSlotSelectProps,
): preact.JSX.Element {
  const { slots, selected, onSelect } = props;

  return (
    <select
      aria-label="Skill fragment"
      value={selected}
      onChange={(event) => onSelect((event.target as HTMLSelectElement).value)}
      className="text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-zinc-900 dark:text-zinc-100"
    >
      {slots.map((slot) => (
        <option key={slot.name} value={slot.name} title={slot.title}>
          {slotGlyph(slot)}
          {slot.name}.md
        </option>
      ))}
    </select>
  );
}

// --- Helpers below main export ---

/**
 * The leading status glyph for a slot's dropdown option. A pencil (rather than a
 * heavy "●" dot) reads as "customized/edited" and stays lighter in the option
 * row; the "⚠" drift mark takes precedence since drift implies an override too.
 * Being switched off outranks both — a fragment that isn't sent at all makes its
 * override and any drift in it moot.
 * @param slot - The slot to mark
 * @returns "✕ " when off, "⚠ " when drifted, "✎ " when customized, else ""
 */
function slotGlyph(slot: SkillSlotView): string {
  if (!slot.enabled) return "✕ ";
  if (slot.drifted) return "⚠ ";
  if (slot.override) return "✎ ";

  return "";
}
