// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { noop } from "#webui/components/mode-context";
import { CopyButton } from "./collection/CopyButton";
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
  /**
   * Reset the override back to the built-in (deletes the override). The button
   * lives in the revealed built-in header and only shows when there's an
   * override to discard (`value !== ""`).
   */
  onReset: () => void;
  /**
   * Fork the built-in into an editable override (the "Customize" action shown
   * while there is no override yet). Persists the built-in as the starting
   * override, which flips this component into the editing view.
   */
  onCustomize: () => void;

  /** Editable-pane callbacks (autosave lifecycle). */
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Editor body for a document that overrides a shipped default, in two states:
 *
 * - **No override yet** (`value === ""`): shows only the built-in default,
 *   read-only, with a "Customize" button that forks it into an editable
 *   override. The default is the content worth showing when there's nothing to
 *   edit, and nothing extra is on screen.
 * - **Has an override**: shows the editable override at full single-column
 *   width; the built-in is hidden until requested (via "Show built-in"), then
 *   renders in a read-only {@link MarkdownEditor} — same markdown formatting as
 *   the editable pane — beside the override, with Copy and (to discard the
 *   override) "Reset to default" buttons.
 *
 * Shared by the skills-fragment editor and the custom-instructions editor.
 * @param props - Panes props
 * @returns Panes element
 */
export function OverridePanes(props: OverridePanesProps): preact.JSX.Element {
  const { editorKey, value, builtIn, overrideLabel } = props;
  const { showBuiltIn, onToggleBuiltIn, onReset, onCustomize } = props;
  const { onChange, onBlur } = props;

  if (value === "") {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <div className="flex items-center justify-between h-5 gap-3">
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            Built-in default
          </span>
          <button
            type="button"
            onClick={onCustomize}
            className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
          >
            Customize
          </button>
        </div>
        <ReadOnlyBuiltIn value={builtIn} />
      </div>
    );
  }

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
        <div className="built-in-reveal flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between h-5 gap-3">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
              Built-in (read-only)
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onToggleBuiltIn(false);
                  onReset();
                }}
                className="text-xs text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
              >
                Reset to default
              </button>

              <CopyButton
                text={builtIn}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              />
              <button
                type="button"
                onClick={() => onToggleBuiltIn(false)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              >
                Hide
              </button>
            </div>
          </div>
          <ReadOnlyBuiltIn value={builtIn} />
        </div>
      )}
    </div>
  );
}

// --- Helpers below main export ---

/**
 * The read-only built-in reference editor, rendered identically whether it is
 * the sole content (no override yet) or the revealed reference beside an
 * override. Read-only markdown so it matches the editable pane's formatting.
 * @param props - Editor props
 * @param props.value - The built-in markdown to display
 * @returns Read-only editor element
 */
function ReadOnlyBuiltIn(props: { value: string }): preact.JSX.Element {
  return (
    <MarkdownEditor
      initialValue={props.value}
      readOnly={true}
      onChange={noop}
      className="flex-1 min-h-0"
    />
  );
}
