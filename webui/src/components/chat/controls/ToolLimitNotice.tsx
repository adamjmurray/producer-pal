// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface ToolLimitNoticeProps {
  /** Send a follow-up message to resume the task (called with "continue") */
  onContinue: () => void;
  /** Whether a response is already in progress (disables the button) */
  disabled?: boolean;
}

/**
 * Notice shown when a response stopped because it reached the tool-call step
 * limit. Offers a Continue button that resumes the task by sending "continue".
 * @param props - Component props
 * @param props.onContinue - Callback to resume the task
 * @param props.disabled - Whether the Continue button is disabled
 * @returns Tool-limit notice element
 */
export function ToolLimitNotice({
  onContinue,
  disabled,
}: ToolLimitNoticeProps) {
  return (
    <div className="flex flex-col items-center py-4 px-6">
      <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 text-center">
        Reached the tool-call limit for one turn. The task may not be finished —
        continue to let it keep working.
      </div>

      <button
        onClick={onContinue}
        disabled={disabled}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
      >
        Continue
      </button>
    </div>
  );
}
