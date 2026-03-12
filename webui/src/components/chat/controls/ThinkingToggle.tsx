// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { THINKING_LEVELS } from "#webui/components/settings/controls/thinking-levels";

export interface ThinkingToggleProps {
  thinking: string;
  onThinkingChange: (thinking: string) => void;
}

/**
 * Cycling icon button for thinking level in chat input area.
 * Cycles through Default → Max → Off on each click.
 * @param props - Component props
 * @param props.thinking - Current thinking level
 * @param props.onThinkingChange - Callback when thinking level changes
 * @returns Clickable icon button
 */
export function ThinkingToggle({
  thinking,
  onThinkingChange,
}: ThinkingToggleProps) {
  const cycle = () => {
    const idx = THINKING_LEVELS.indexOf(
      thinking as (typeof THINKING_LEVELS)[number],
    );
    // idx + 1 stays valid: unknown level (-1+1=0) wraps to Default
    const next = THINKING_LEVELS[
      (idx + 1) % THINKING_LEVELS.length
    ] as (typeof THINKING_LEVELS)[number];

    onThinkingChange(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Thinking: ${thinking}`}
      aria-label={`Thinking level: ${thinking}`}
      className="flex items-center justify-center p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <ThinkingStateIcon level={thinking} />
    </button>
  );
}

// --- Helpers below main export ---

/**
 * Icon reflecting the current thinking level, for use in settings and chat.
 * @param props - Component props
 * @param props.level - Thinking level
 * @returns Icon for the given thinking level
 */
export function ThinkingStateIcon({ level }: { level: string }) {
  if (level === "Off") {
    return (
      <span
        className="text-sm leading-none"
        style={{ filter: "grayscale(1)", opacity: 0.4 }}
        aria-hidden="true"
      >
        🧠
      </span>
    );
  }

  if (level === "Max") {
    return (
      <span
        className="flex items-center leading-none gap-px"
        aria-hidden="true"
      >
        <span className="text-xs">🧠</span>
        <span className="text-xs">⚡</span>
      </span>
    );
  }

  return (
    <span className="text-sm leading-none" aria-hidden="true">
      🧠
    </span>
  );
}
