// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface DriftNoteProps {
  /** Whether the built-in default changed since this override was forked. */
  drifted: boolean;
  /** Producer Pal version the override was forked from (null when unknown). */
  forkedFromVersion: string | null;
}

/**
 * Amber "the shipped default changed since you forked" badge for a customized
 * override (a skills fragment or the custom instructions). Returns null when not
 * drifted, so callers can render it unconditionally in their controls strip.
 * @param props - Drift state and the fork-time version
 * @returns The badge, or null when the override is not drifted
 */
export function DriftNote(props: DriftNoteProps): preact.JSX.Element | null {
  if (!props.drifted) return null;

  return (
    <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
      ⚠ Default changed since you forked
      {props.forkedFromVersion != null ? ` (v${props.forkedFromVersion})` : ""}.
    </span>
  );
}
