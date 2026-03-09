// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface SmallModelIndicatorProps {
  active: boolean;
}

/**
 * Responsive small model mode indicator.
 * Shows full text at sm+, turtle-only below sm. Hidden when inactive.
 * @param props - Component props
 * @param props.active - Whether small model mode is active
 * @returns Indicator element or null
 */
export function SmallModelIndicator({ active }: SmallModelIndicatorProps) {
  if (!active) return null;

  return (
    <span className="text-xs text-amber-600 dark:text-amber-400">
      <span className="hidden sm:inline" aria-label="Small model mode">
        🐢 small model
      </span>

      <span className="sm:hidden" aria-label="Small model mode">
        🐢
      </span>
    </span>
  );
}
