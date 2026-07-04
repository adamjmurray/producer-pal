// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noop } from "#webui/components/mode-context";
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
  /**
   * Whether the built-in reference pane is revealed. Owned by the parent so it
   * can widen the layout to two columns only while the reference is shown (and
   * keep the editor at the normal single-column width the rest of the time).
   */
  showBuiltIn: boolean;
  /** Reveal / collapse the built-in reference pane. */
  onToggleBuiltIn: (show: boolean) => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Editor body for a document that overrides a shipped default. The editable
 * override pane is always shown; the built-in reference is hidden by default and
 * revealed on demand (via "Show built-in"), so the default isn't on screen at
 * all times and the editor can use the full single-column width. When revealed,
 * the built-in renders in a read-only {@link MarkdownEditor} — same markdown
 * formatting as the editable pane — beside the override, with a Copy button so a
 * user can fork the default into the (empty-by-design) override pane. Shared by
 * the skills-fragment editor and the custom-instructions editor.
 * @param props - Panes props
 * @returns Panes element
 */
export function OverridePanes(props: OverridePanesProps): preact.JSX.Element {
  const { editorKey, value, builtIn, overrideLabel } = props;
  const { showBuiltIn, onToggleBuiltIn, onChange, onBlur } = props;

  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between h-5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {overrideLabel}
          </span>
          {!showBuiltIn && (
            <button
              type="button"
              onClick={() => onToggleBuiltIn(true)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
              Show built-in
            </button>
          )}
        </div>
        <MarkdownEditor
          key={editorKey}
          initialValue={value}
          readOnly={false}
          onChange={onChange}
          onBlur={onBlur}
          className="flex-1 min-h-0"
        />
      </div>

      {showBuiltIn && (
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between h-5 gap-3">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
              Built-in (read-only)
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(builtIn)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => onToggleBuiltIn(false)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              >
                Hide
              </button>
            </div>
          </div>
          <MarkdownEditor
            initialValue={builtIn}
            readOnly={true}
            onChange={noop}
            className="flex-1 min-h-0"
          />
        </div>
      )}
    </div>
  );
}
