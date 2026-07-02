// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MarkdownEditor } from "./MarkdownEditor";

interface OverridePanesProps {
  /** Remount key for the uncontrolled editor (bumped on reset/reload). */
  editorKey: number;
  /** The editable override body (empty when the slot tracks the built-in). */
  value: string;
  /** The read-only built-in reference shown alongside the override. */
  builtIn: string;
  /** Label above the editable pane (e.g. "Your override" / "Your instructions"). */
  overrideLabel: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Side-by-side editor body: an editable override pane (empty when tracking the
 * built-in) beside a read-only, selectable built-in pane with a Copy button, so
 * a user can fork the default by copying it into the override pane. Shared by
 * the skills-fragment editor and the custom-instructions editor — both override
 * a shipped default and benefit from seeing it next to their edit.
 * @param props - Panes props
 * @returns Panes element
 */
export function OverridePanes(props: OverridePanesProps): preact.JSX.Element {
  const { editorKey, value, builtIn, overrideLabel, onChange, onBlur } = props;

  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="h-5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {overrideLabel}
        </span>
        <MarkdownEditor
          key={editorKey}
          initialValue={value}
          readOnly={false}
          onChange={onChange}
          onBlur={onBlur}
          className="flex-1 min-h-0"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between h-5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Built-in (read-only)
          </span>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(builtIn)}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Copy
          </button>
        </div>
        <pre className="flex-1 min-h-0 overflow-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 text-xs whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {builtIn}
        </pre>
      </div>
    </div>
  );
}
