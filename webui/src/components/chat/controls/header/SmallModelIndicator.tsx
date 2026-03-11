// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface SmallModelIndicatorProps {
  active: boolean;
  locked?: boolean;
}

/**
 * Responsive small model mode indicator.
 * Shows full text at sm+, turtle-only below sm. Hidden when inactive and not locked.
 * When locked, appends "(locked)" to indicate divergence from current defaults.
 * @param props - Component props
 * @param props.active - Whether small model mode is active for this conversation
 * @param props.locked - Whether the value differs from the current default setting
 * @returns Indicator element or null
 */
export function SmallModelIndicator({
  active,
  locked,
}: SmallModelIndicatorProps) {
  if (!active && !locked) return null;

  const suffix = locked ? " (locked)" : "";
  const label = active ? `small model${suffix}` : `small model off${suffix}`;

  return (
    <span className="text-xs text-amber-600 dark:text-amber-400">
      <span className="hidden sm:inline" aria-label={label}>
        🐢 {label}
      </span>

      <span className="sm:hidden" aria-label={label}>
        🐢
      </span>
    </span>
  );
}
