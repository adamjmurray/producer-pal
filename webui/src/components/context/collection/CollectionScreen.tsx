// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { cloneElement } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useLeaveGuardContext } from "#webui/components/context/collection/leave-guard";
import { ContextHeader } from "#webui/components/context/editor/ContextHeader";
import { type DocStatus } from "#webui/hooks/context/use-doc";
import {
  type DocCollectionEntry,
  type UseDocCollectionReturn,
} from "#webui/hooks/context/use-doc-collection";

const CLOSE_ARIA_LABEL = "Close context editor";

// A synthetic "ready" status for the header's save indicator while an existing
// entry is open — the per-entry editor is always ready (its content is in hand);
// only the collection-level save status varies.
const EDITING_STATUS: DocStatus = { kind: "ready", content: "" };

/** Which entry the right pane is editing: an existing one, or a fresh one. */
type Selection = { mode: "edit"; name: string } | { mode: "new" };

/** Args passed to the caller's left-pane list renderer. */
export interface CollectionListRenderArgs<TView> {
  entries: TView[];
  selectedName: string | null;
  creating: boolean;
  onSelect: (name: string) => void;
  onNew: () => void;
  /** Delete an entry from the list; resets to the create form if it was open. */
  onDelete: (name: string) => void;
}

/** Args passed to the caller's right-pane editor renderer. */
export interface CollectionEditorRenderArgs<TView> {
  entry: TView | null;
  onSaved: (name: string) => void;
  onDeleted: () => void;
  /**
   * Follow this editor's entry to a new slug WITHOUT remounting the editor (a
   * rename). The live draft — including anything typed during the rename's
   * round trip — exists only in the mounted instance's state, so remounting
   * there re-seeds from the server's pre-edit echo and drops it. Editors whose
   * collection can't rename (custom skills) ignore this.
   *
   * Takes the old slug too: a rename can resolve after the user has already
   * moved to another entry, and moving the selection then would point the
   * mounted editor at someone else's entry — which it would autosave over.
   */
  onRenamed: (from: string, to: string) => void;
}

interface CollectionScreenProps<TView extends DocCollectionEntry, TInput> {
  /** Header title (e.g. "Memory"). */
  title: string;
  /** Centered message while the collection loads (e.g. "Loading memory…"). */
  loadingLabel: string;
  /** Banner shown when the edited entry was deleted outside the editor. */
  deletedBanner: string;
  /** The collection hook (mounted in ContextTabs). */
  collection: UseDocCollectionReturn<TView, TInput>;
  /** One-line explainer shown in a strip below the header (like the doc tabs). */
  description?: string;
  /** The tab strip rendered in the header. */
  tabSlot: preact.JSX.Element;
  /** Close the overlay (omitted on the standalone /context page). */
  onClose?: () => void;
  /** Render the left-pane list for the current entries + selection. */
  renderList: (args: CollectionListRenderArgs<TView>) => preact.JSX.Element;
  /** Render the right-pane editor for the active entry (keyed by selection). */
  renderEditor: (args: CollectionEditorRenderArgs<TView>) => preact.JSX.Element;
}

/**
 * Two-pane manager shared by the collection tabs (memory, custom skills): a left
 * pane listing the derived index (delegated to `renderList`) and a right pane
 * editing the selected entry or creating a new one (delegated to `renderEditor`).
 * Owns the selection state, loading/error gating, and the delete-out-from-under
 * affordance; the caller supplies the domain list + editor and the labels.
 *
 * The editor is keyed by a selection epoch (not the found entry) so its draft
 * re-seeds on switch, yet a poll that deletes the entry mid-edit keeps the
 * editor mounted with the user's draft (the banner explains it; Save
 * re-creates), and so does a rename (see `onRenamed`).
 *
 * @param props - Screen props
 * @returns Screen element
 */
export function CollectionScreen<TView extends DocCollectionEntry, TInput>(
  props: CollectionScreenProps<TView, TInput>,
): preact.JSX.Element {
  const { collection, tabSlot, onClose, title, loadingLabel, deletedBanner } =
    props;
  const { description } = props;
  const [selected, setSelected] = useState<Selection>({ mode: "new" });
  // The editor's identity. Bumped by every selection change that lands on a
  // DIFFERENT draft, so the editor remounts and re-seeds — including a New
  // press while the create form is already the active pane (otherwise a
  // half-filled draft sat there and the button looked inert). A RENAME
  // deliberately does NOT bump it: see the onRenamed doc.
  const [editorEpoch, setEditorEpoch] = useState(0);
  const editorKey = `${selected.mode}:${editorEpoch}`;
  // Selecting another entry unmounts the active editor; confirm a discard first
  // if it holds an unsaved new draft (the editor registers the guard).
  const leaveGuard = useLeaveGuardContext();

  // Reset the save indicator whenever the editor switches to another draft, so
  // it never carries the previous entry's "Saved" onto the next one or onto the
  // create form. A rename keeps the same editor, and with it its own outcome.
  const { resetSaveStatus } = collection;

  useEffect(() => {
    resetSaveStatus();
  }, [editorKey, resetSaveStatus]);

  if (collection.status.kind !== "ready") {
    return (
      <CollectionStatusScreen
        title={title}
        tabSlot={tabSlot}
        onClose={onClose}
        message={
          collection.status.kind === "error"
            ? collection.status.message
            : loadingLabel
        }
        tone={collection.status.kind === "error" ? "error" : "muted"}
      />
    );
  }

  const entries = collection.status.entries;
  const activeEntry =
    selected.mode === "edit"
      ? (entries.find((entry) => entry.name === selected.name) ?? null)
      : null;
  // A rename resolves this to null for ONE render: the collection hook's commit
  // drops the old slug before the caller's `.then` moves `selected` to the new
  // one. That is not a paintable flicker — both updates are microtasks in the
  // same task, and a browser can only paint between tasks, so the banner below
  // is added and removed within one checkpoint (guarded by MemoryScreen-rename's
  // next-task assertion). Keep those two updates in the same task: an `await`
  // on I/O between them would make this transient banner genuinely visible.
  const deletedExternally = selected.mode === "edit" && activeEntry == null;

  // Point the right pane at another draft, remounting the editor so it re-seeds.
  // Re-selecting the entry already open is a no-op, so clicking its row again
  // (or re-saving it under the same slug) keeps the in-progress draft.
  const selectDraft = (next: Selection): void => {
    if (
      next.mode === "edit" &&
      selected.mode === "edit" &&
      selected.name === next.name
    ) {
      return;
    }

    setSelected(next);
    setEditorEpoch((epoch) => epoch + 1);
  };

  const editor = props.renderEditor({
    entry: activeEntry,
    onSaved: (name) => selectDraft({ mode: "edit", name }),
    onDeleted: () => selectDraft({ mode: "new" }),
    // No epoch bump: the entry changes slug under the SAME mounted editor.
    // Only when that editor is still the one that was renamed — if the user
    // navigated away while the rename was in flight, the mounted editor is on
    // another entry and must not be dragged onto this slug.
    onRenamed: (from, to) =>
      setSelected((prev) =>
        prev.mode === "edit" && prev.name === from
          ? { mode: "edit", name: to }
          : prev,
      ),
  });

  // Delete from the list (the row trash). Return to the create form when the
  // deleted entry was the one open, so the right pane never lingers on a gone
  // entry — this is a deliberate delete, so no "deleted outside the editor"
  // banner (that path is for external deletes of a still-open draft).
  const handleDeleteEntry = async (name: string): Promise<void> => {
    const ok = await collection.deleteEntry(name);

    if (ok && selected.mode === "edit" && selected.name === name) {
      selectDraft({ mode: "new" });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title={title}
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={activeEntry != null ? EDITING_STATUS : undefined}
        saveStatus={collection.saveStatus}
        onClose={onClose}
      />
      {description != null && (
        // Flex (like the doc tabs' controls strip) so the explainer is a block
        // box with its own text-xs leading — as an inline span it would inherit
        // the page's looser line-height and read differently from the doc tabs.
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 text-sm flex items-center">
          <span className="min-w-0 flex-1 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 flex flex-col min-h-0 border-r border-zinc-200 dark:border-zinc-700">
          {props.renderList({
            entries,
            selectedName: activeEntry?.name ?? null,
            creating: activeEntry == null,
            onSelect: (name) => {
              if (leaveGuard.confirmLeave())
                selectDraft({ mode: "edit", name });
            },
            // New always means a BLANK form — including when the create form is
            // already open holding a half-filled draft, which used to be kept
            // (the button appeared to do nothing). The editor's own discard
            // confirm gates it, exactly as onSelect does: both collections
            // register one for a dirty new draft, so the user is asked before
            // losing it. An editor that registers nothing just gets the fresh
            // form.
            onNew: () => {
              if (!leaveGuard.confirmLeave()) return;
              selectDraft({ mode: "new" });
            },
            onDelete: (name) => void handleDeleteEntry(name),
          })}
        </aside>
        <div className="flex-1 min-h-0 flex flex-col">
          {deletedExternally && (
            <DeletedExternallyBanner
              message={deletedBanner}
              onDiscard={() => selectDraft({ mode: "new" })}
            />
          )}
          {cloneElement(editor, { key: editorKey })}
        </div>
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Banner shown when the entry being edited was deleted outside the editor (the
 * assistant's own forget, a hand delete, the Max device). The draft is kept so
 * the user can Save to re-create it; Discard drops it and returns to Create.
 * @param props - Banner props
 * @param props.message - The collection-specific explanation
 * @param props.onDiscard - Drop the draft and return to the Create form
 * @returns Banner element
 */
function DeletedExternallyBanner(props: {
  message: string;
  onDiscard: () => void;
}): preact.JSX.Element {
  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      <span>{props.message}</span>
      <button
        type="button"
        onClick={props.onDiscard}
        className="rounded bg-amber-200 dark:bg-amber-800/70 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
      >
        Discard
      </button>
    </div>
  );
}

export interface CollectionStatusScreenProps {
  title: string;
  tabSlot: preact.JSX.Element;
  onClose?: () => void;
  message: string;
  tone: "muted" | "error";
  /**
   * Optional controls row rendered below the header (e.g. the Skills tab's
   * Fragments | Preview toggle, so it stays reachable while the list loads).
   */
  belowHeader?: preact.JSX.Element;
}

/**
 * Loading/error state for a collection tab: the shared header, an optional
 * controls row, and a centered message. Shared by the two-pane collection tabs
 * and the Skills tab (which passes its view toggle as `belowHeader`).
 * @param props - Status screen props
 * @returns Status screen element
 */
export function CollectionStatusScreen(
  props: CollectionStatusScreenProps,
): preact.JSX.Element {
  const { title, tabSlot, onClose, message, tone, belowHeader } = props;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title={title}
        tabSlot={tabSlot}
        closeAriaLabel={CLOSE_ARIA_LABEL}
        status={
          tone === "error" ? { kind: "error", message } : { kind: "loading" }
        }
        onClose={onClose}
      />
      {belowHeader != null && (
        <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
          {belowHeader}
        </div>
      )}
      <div
        className={`flex items-center justify-center flex-1 px-8 text-center ${
          tone === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
