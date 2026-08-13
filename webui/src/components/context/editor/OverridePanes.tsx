// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { TrashIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { CopyButton } from "#webui/components/context/collection/CopyButton";
import { MarkdownEditor } from "#webui/components/context/MarkdownEditor";
import { noop } from "#webui/components/mode-context";
import { CHIP_BUTTON_CLASS } from "./context-buttons";

/** Pane label while the built-in is shown and nothing has been customized yet. */
const UNFORKED_LABEL = "Default — start typing to customize";

interface OverridePanesProps {
  /** Remount key for the uncontrolled editor (bumped on reset/reload). */
  editorKey: number;
  /**
   * Whether the slot is in "override" mode (see `useContextEditorState`). Drives
   * the pane chrome — LATCHED, not derived from `value`, so editing the override
   * down to empty doesn't flip it back to the built-in framing.
   */
  hasOverride: boolean;
  /**
   * The stored override, and the editor's seed content whenever it is non-empty.
   * Only read at (re)mount (the editor is uncontrolled, keyed by `editorKey`);
   * an empty one means there's nothing stored, so the editor seeds from
   * `builtIn` instead.
   *
   * Deliberately NOT branched on `hasOverride`: that latch is set from an
   * effect, so it still reads false on the render where a stored override first
   * mounts the editor — seeding off it would show the built-in in place of the
   * user's saved text, and the frozen editor key means the corrected render
   * never remounts to fix it. Empty-vs-stored is the same distinction anyway:
   * blank content deletes the override server-side.
   */
  value: string;
  /** The shipped default — the editor's seed until the user forks it. */
  builtIn: string;
  /** Label above the pane once forked (e.g. "Your override" / "Your instructions"). */
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
   * Latch into override mode. Fired on the first edit made while the pane is
   * still showing the built-in — the editor already holds the default's text, so
   * the edit's own autosave persists the fork; this only flips the chrome.
   */
  onBeginOverride: () => void;

  /** Editable-pane callbacks (autosave lifecycle). */
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Editor body for a document that overrides a shipped default. One editor, two
 * framings — there is no read-only state to click out of:
 *
 * - **No override yet** (`!hasOverride`): the editor is seeded with the default
 *   and labelled {@link UNFORKED_LABEL}. Typing forks it — the document already
 *   holds the default's bytes, so the first edit's autosave writes default +
 *   edit as the override, exactly what an explicit "Customize" used to persist.
 * - **Has an override**: the same editor, relabelled, with a trash "Reset to
 *   default" button beside its label. The default is hidden until requested (via
 *   "Show default"), then renders in a read-only {@link MarkdownEditor} — same
 *   markdown formatting as the editable pane — beside the override, with a Copy
 *   button.
 *
 * The two framings deliberately share one JSX position AND one editor key (see
 * {@link useBuiltInSeedKey}), so the fork doesn't remount CodeMirror and drop
 * the keystroke that triggered it.
 *
 * Shared by the skills-fragment editor and the custom-instructions editor.
 * @param props - Panes props
 * @returns Panes element
 */
export function OverridePanes(props: OverridePanesProps): preact.JSX.Element {
  const { editorKey, hasOverride, value, builtIn, overrideLabel } = props;
  const { showBuiltIn, onToggleBuiltIn, onReset, onBeginOverride } = props;
  const { onChange, onBlur } = props;
  const seedKey = useBuiltInSeedKey(builtIn, hasOverride);

  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between h-7 gap-3">
          <span
            className={`min-w-0 truncate text-xs font-medium ${
              hasOverride
                ? "text-zinc-500 dark:text-zinc-400"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {hasOverride ? overrideLabel : UNFORKED_LABEL}
          </span>
          <div className="flex items-center gap-2">
            {hasOverride && (
              <>
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
                    className={`shrink-0 ${CHIP_BUTTON_CLASS}`}
                  >
                    Show default
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <MarkdownEditor
          key={`${editorKey}:${seedKey}`}
          initialValue={value !== "" ? value : builtIn}
          readOnly={false}
          onChange={(next) => {
            // The first edit to an un-forked pane IS the fork.
            if (!hasOverride) onBeginOverride();
            onChange(next);
          }}
          onBlur={onBlur}
          className="flex-1 min-h-0"
        />
      </div>

      {showBuiltIn && (
        <div className="built-in-reveal flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between h-7 gap-3">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
              Default
            </span>
            <div className="flex items-center gap-2">
              <CopyButton
                text={builtIn}
                className={`shrink-0 ${CHIP_BUTTON_CLASS}`}
              />
              <button
                type="button"
                onClick={() => onToggleBuiltIn(false)}
                className={`shrink-0 ${CHIP_BUTTON_CLASS}`}
              >
                Hide
              </button>
            </div>
          </div>
          <MarkdownEditor
            key={builtIn}
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

// --- Helpers below main export ---

/**
 * The built-in half of the editable pane's remount key.
 *
 * MarkdownEditor is uncontrolled (seeds at mount only), so while the pane still
 * shows the default, a built-in that changes server-side — e.g. the notation
 * switch re-tuning the fragment, picked up by the 5s poll — must remount the
 * editor or the user would read a stale default and fork from it.
 *
 * It stops tracking the moment the pane becomes an override: from then on the
 * editor holds the user's text, and re-keying on an upstream built-in change
 * would throw that away. Freezing here (rather than branching the key on
 * `hasOverride`) is also what keeps the key STABLE across the fork itself — the
 * flip render must not remount, or it eats the keystroke that caused it.
 * @param builtIn - The current built-in default
 * @param hasOverride - Whether the pane has forked into an override
 * @returns The seed key to compose into the editor's `key`
 */
function useBuiltInSeedKey(builtIn: string, hasOverride: boolean): string {
  const [seed, setSeed] = useState(builtIn);

  useEffect(() => {
    if (hasOverride) return;
    setSeed(builtIn);
  }, [builtIn, hasOverride]);

  return seed;
}
