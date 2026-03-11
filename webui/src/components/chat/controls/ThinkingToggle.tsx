// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { THINKING_LEVELS } from "#webui/components/settings/controls/thinking-levels";

const LEVEL_LABELS: Record<string, string> = {
  Adaptive: "A",
  Low: "L",
  Medium: "M",
  High: "H",
};

export interface ThinkingToggleProps {
  thinking: string;
  onThinkingChange: (thinking: string) => void;
}

const base = "px-1.5 py-1 text-xs font-medium transition-colors cursor-pointer";
const inactive =
  "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200";
const active = "bg-blue-600 text-white";

/**
 * Segmented toggle for thinking level selection
 * @param props - Component props
 * @param props.thinking - Current thinking level
 * @param props.onThinkingChange - Callback when thinking level changes
 * @returns Segmented toggle element
 */
export function ThinkingToggle({
  thinking,
  onThinkingChange,
}: ThinkingToggleProps) {
  return (
    <div className="flex rounded-md overflow-hidden border border-zinc-300 dark:border-zinc-600 self-center">
      {THINKING_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onThinkingChange(level)}
          className={`${base} ${thinking === level ? active : inactive}`}
          title={level}
          aria-label={level}
        >
          {LEVEL_LABELS[level] ?? level[0]}
        </button>
      ))}
    </div>
  );
}
