// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ThinkingStateIcon } from "#webui/components/chat/controls/ThinkingToggle";
import { THINKING_LEVELS } from "#webui/components/settings/controls/helpers/thinking-levels";
import { Tooltip } from "#webui/components/settings/controls/Tooltip";

interface ThinkingSelectorProps {
  thinking: string;
  setThinking: (thinking: string) => void;
}

/**
 * Thinking level selector with icon and tooltip
 * @param props - Component props
 * @param props.thinking - Current thinking level
 * @param props.setThinking - Thinking level setter callback
 * @returns Thinking selector element
 */
export function ThinkingSelector({
  thinking,
  setThinking,
}: ThinkingSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <ThinkingStateIcon level={thinking} />
      <label htmlFor="thinking-select" className="shrink-0 text-sm">
        Thinking
      </label>
      <select
        id="thinking-select"
        value={thinking}
        onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
      >
        {THINKING_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <Tooltip text="Default for new conversations. Can be changed at any time during a chat using the in-chat toggle." />
    </div>
  );
}
