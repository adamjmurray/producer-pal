// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
} from "#webui/chat/sdk/step-budget";

interface PreferencesTabProps {
  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
  showTokenUsage: boolean;
  setShowTokenUsage: (show: boolean) => void;
  autoUpdateCheck: boolean;
  setAutoUpdateCheck: (enabled: boolean) => void;
  maxToolSteps: number;
  setMaxToolSteps: (steps: number) => void;
  onDeleteAllConversations: () => void;
  onDeleteUnbookmarkedConversations: () => void;
}

/**
 * Preferences tab component for settings (theme and display options)
 * @param {object} props - Component props
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {boolean} props.showTimestamps - Whether to show message timestamps
 * @param {Function} props.setShowTimestamps - Function to toggle timestamps
 * @param {boolean} props.showHelpLinks - Whether to show help link buttons
 * @param {Function} props.setShowHelpLinks - Function to toggle help links
 * @param {boolean} props.showTokenUsage - Whether to show per-message token usage
 * @param {Function} props.setShowTokenUsage - Function to toggle token usage
 * @param {boolean} props.autoUpdateCheck - Whether to check GitHub for new releases
 * @param {Function} props.setAutoUpdateCheck - Function to toggle update checking
 * @param {number} props.maxToolSteps - Tool steps one turn may spend
 * @param {Function} props.setMaxToolSteps - Function to set the step budget
 * @param {Function} props.onDeleteAllConversations - Callback to delete all conversations
 * @param {Function} props.onDeleteUnbookmarkedConversations - Callback to delete unstarred conversations
 * @returns {JSX.Element} Preferences tab component
 */
export function PreferencesTab({
  theme,
  setTheme,
  showTimestamps,
  setShowTimestamps,
  showHelpLinks,
  setShowHelpLinks,
  showTokenUsage,
  setShowTokenUsage,
  autoUpdateCheck,
  setAutoUpdateCheck,
  maxToolSteps,
  setMaxToolSteps,
  onDeleteAllConversations,
  onDeleteUnbookmarkedConversations,
}: PreferencesTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="theme-select" className="mb-2 block text-sm">
          Theme
        </label>
        <select
          id="theme-select"
          value={theme}
          onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      {/* Rendered from one list so the four stay identical; the tests index
          them by position, so the order here is the order on screen. The last
          is machine-wide and shared with the Max for Live device, so it applies
          on change rather than on Save — like the Delete buttons below. */}
      {(
        [
          ["Show message timestamps", showTimestamps, setShowTimestamps],
          ["Show help links", showHelpLinks, setShowHelpLinks],
          ["Show message token usage", showTokenUsage, setShowTokenUsage],
          [
            "Automatically check for new versions",
            autoUpdateCheck,
            setAutoUpdateCheck,
          ],
        ] as const
      ).map(([label, checked, setChecked]) => (
        <label
          key={label}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked((e.target as HTMLInputElement).checked)}
          />
          {label}
        </label>
      ))}

      <StepBudgetField
        maxToolSteps={maxToolSteps}
        setMaxToolSteps={setMaxToolSteps}
      />

      <div className="mt-4 border-t border-zinc-300 pt-4 dark:border-zinc-600">
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-300">
          Cleanup Conversations
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Delete all conversations that are not bookmarked? This cannot be undone.",
                )
              ) {
                onDeleteUnbookmarkedConversations();
              }
            }}
            className="rounded-lg border border-red-600 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-600 hover:text-white"
          >
            Delete unstarred
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete all conversations? This cannot be undone.")) {
                onDeleteAllConversations();
              }
            }}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700"
          >
            Delete all
          </button>
        </div>
      </div>
      <div className="border-b border-zinc-300 dark:border-zinc-600" />
    </div>
  );
}

// --- Helpers below main export ---

interface StepBudgetFieldProps {
  maxToolSteps: number;
  setMaxToolSteps: (steps: number) => void;
}

/**
 * "Tool steps per turn": how much tool work one turn may do before it stops and
 * hands control back. Local to this tab rather than a controls/ component
 * because that directory is at its folder-size cap.
 * @param {StepBudgetFieldProps} props - Component props
 * @param {number} props.maxToolSteps - The current budget
 * @param {Function} props.setMaxToolSteps - Commits a new budget to the buffer
 * @returns {JSX.Element} The step-budget field
 */
function StepBudgetField({
  maxToolSteps,
  setMaxToolSteps,
}: StepBudgetFieldProps) {
  return (
    <div className="mt-4 border-t border-zinc-300 pt-4 dark:border-zinc-600">
      <label htmlFor="max-tool-steps" className="mb-1 block text-sm">
        Tool steps per turn
      </label>
      <input
        id="max-tool-steps"
        data-testid="max-tool-steps"
        type="number"
        min={MIN_TOOL_STEPS}
        max={MAX_TOOL_STEPS_LIMIT}
        step={1}
        value={maxToolSteps}
        // Commit only an in-range whole number: an empty field and a half-typed
        // "1" both parse to something a turn would then run on, and this field
        // is saved with everything else rather than confirmed on its own.
        onInput={(e) => {
          const next = Number((e.target as HTMLInputElement).value);

          if (
            Number.isInteger(next) &&
            next >= MIN_TOOL_STEPS &&
            next <= MAX_TOOL_STEPS_LIMIT
          ) {
            setMaxToolSteps(next);
          }
        }}
        className="w-24 rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
      />
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
        How much tool work one turn may do before it stops and hands back
        control ({MIN_TOOL_STEPS}–{MAX_TOOL_STEPS_LIMIT}, default{" "}
        {DEFAULT_MAX_TOOL_STEPS}). Raise it for long arrangement tasks that keep
        stopping early; lower it to keep a looping model on a shorter leash.
        Subagent orchestrators and workers scale with it.
      </p>
    </div>
  );
}
