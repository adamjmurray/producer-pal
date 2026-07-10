// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  NewConversationIcon,
  TrashIcon,
} from "#webui/components/chat/controls/header/HeaderIcons";
import { CopyButton } from "#webui/components/context/collection/CopyButton";
import { MarkdownEditor } from "#webui/components/context/MarkdownEditor";
import { noop } from "#webui/components/mode-context";

/** Small text-link style shared by the pane-header toggles (Show default / Hide). */
const HEADER_LINK_CLASS =
  "shrink-0 text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors";

interface OverridePanesProps {
  /** Remount key for the uncontrolled editor (bumped on reset/reload). */
  editorKey: number;
  /**
   * Whether the slot is in "override" mode (see `useContextEditorState`). Drives
   * the editable-vs-built-in structure — LATCHED, not derived from `value`, so
   * editing the override down to empty doesn't collapse the editable pane.
   */
  hasOverride: boolean;
  /**
   * The editor's seed content for the editable pane. Only read at (re)mount
   * (the editor is uncontrolled, keyed by `editorKey`); the structural branch
   * uses `hasOverride`, never this.
   */
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
   * Reset the override back to the built-in default (deletes the override). The
   * trash button lives beside the editable content whenever there's an override
   * (`hasOverride`), so it's reachable without first revealing the default.
   * Resolves whether the reset actually happened (`false` when the user cancels
   * its confirm), so the reveal only collapses on an actual reset.
   */
  onReset: () => Promise<boolean>;
  /**
   * Fork the built-in default into an editable override (the "Customize" action
   * shown while there is no override yet). Persists the default as the starting
   * override, which flips this component into the editing view.
   */
  onCustomize: () => void;
  /**
   * Optional control centered in the pane header (the Skills tab passes its
   * Preview/Source view toggle here). Omitted by the custom-instructions editor,
   * which has no such view.
   */
  centerControl?: preact.JSX.Element;

  /** Editable-pane callbacks (autosave lifecycle). */
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Editor body for a document that overrides a shipped default, in two states:
 *
 * - **No override yet** (`!hasOverride`): shows only the default, read-only,
 *   with a pen "Customize" button that forks it into an editable override. The
 *   default is the content worth showing when there's nothing to edit, and
 *   nothing extra is on screen.
 * - **Has an override**: shows the editable override at full single-column
 *   width, with a trash "Reset to default" button beside its label (reachable
 *   without revealing the default first). The default is hidden until requested
 *   (via "Show default"), then renders in a read-only {@link MarkdownEditor} —
 *   same markdown formatting as the editable pane — beside the override, with a
 *   Copy button.
 *
 * Shared by the skills-fragment editor and the custom-instructions editor.
 * @param props - Panes props
 * @returns Panes element
 */
export function OverridePanes(props: OverridePanesProps): preact.JSX.Element {
  const { editorKey, hasOverride, value, builtIn, overrideLabel } = props;
  const { showBuiltIn, onToggleBuiltIn, onReset, onCustomize } = props;
  const { centerControl, onChange, onBlur } = props;

  if (!hasOverride) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="min-w-0 truncate text-xs font-medium text-zinc-400 dark:text-zinc-500">
            Default
          </span>
          <div className="justify-self-center">{centerControl}</div>
          <button
            type="button"
            onClick={onCustomize}
            className="justify-self-end shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
          >
            <NewConversationIcon />
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-5 gap-3">
          <span className="min-w-0 truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {overrideLabel}
          </span>
          <div className="justify-self-center">{centerControl}</div>
          <div className="justify-self-end flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                // Collapse the reveal only when the reset actually happened —
                // cancelling its confirm must leave the comparison open.
                void onReset().then((ok) => {
                  if (ok) onToggleBuiltIn(false);
                })
              }
              aria-label="Reset to default"
              title="Reset to default"
              className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
            {!showBuiltIn && (
              <button
                type="button"
                onClick={() => onToggleBuiltIn(true)}
                className={HEADER_LINK_CLASS}
              >
                Show default
              </button>
            )}
          </div>
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
              Default
            </span>
            <div className="flex items-center gap-3">
              <CopyButton text={builtIn} className={HEADER_LINK_CLASS} />
              <button
                type="button"
                onClick={() => onToggleBuiltIn(false)}
                className={HEADER_LINK_CLASS}
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
