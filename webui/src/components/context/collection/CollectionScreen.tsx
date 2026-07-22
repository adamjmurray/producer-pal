// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { cloneElement } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useLeaveGuardContext } from "#webui/components/context/collection/leave-guard";
import { ContextHeader } from "#webui/components/context/editor/ContextHeader";
import {
  type DocCollectionEntry,
  type UseDocCollectionReturn,
} from "#webui/hooks/context/use-doc-collection";
import { type DocMemoryStatus } from "#webui/hooks/context/use-doc-memory";

const CLOSE_ARIA_LABEL = "Close context editor";

// A synthetic "ready" status for the header's save indicator while an existing
// entry is open — the per-entry editor is always ready (its content is in hand);
// only the collection-level save status varies.
const EDITING_STATUS: DocMemoryStatus = { kind: "ready", content: "" };

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
 * The editor is keyed by the selection (not the found entry) so its draft
 * re-seeds on switch, yet a poll that deletes the entry mid-edit keeps the
 * editor mounted with the user's draft (the banner explains it; Save re-creates).
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
  const selectionKey = selected.mode === "edit" ? selected.name : "__new__";
  // Selecting another entry unmounts the active editor; confirm a discard first
  // if it holds an unsaved new draft (the editor registers the guard).
  const leaveGuard = useLeaveGuardContext();

  // Reset the save indicator whenever the edited entry (or the create form)
  // changes, so it never carries the previous entry's "Saved" onto the next one
  // or onto the create form.
  const { resetSaveStatus } = collection;

  useEffect(() => {
    resetSaveStatus();
  }, [selectionKey, resetSaveStatus]);

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
  const editorKey = selected.mode === "edit" ? selected.name : "__new__";
  const deletedExternally = selected.mode === "edit" && activeEntry == null;
  const editor = props.renderEditor({
    entry: activeEntry,
    onSaved: (name) => setSelected({ mode: "edit", name }),
    onDeleted: () => setSelected({ mode: "new" }),
  });

  // Delete from the list (the row trash). Return to the create form when the
  // deleted entry was the one open, so the right pane never lingers on a gone
  // entry — this is a deliberate delete, so no "deleted outside the editor"
  // banner (that path is for external deletes of a still-open draft).
  const handleDeleteEntry = async (name: string): Promise<void> => {
    const ok = await collection.deleteEntry(name);

    if (ok && selected.mode === "edit" && selected.name === name) {
      setSelected({ mode: "new" });
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
                setSelected({ mode: "edit", name });
            },
            // From the create form, New keeps it mounted (same key), so a dirty
            // draft isn't abandoned — no guard. But from an entry (including one
            // deleted out from under us, whose kept draft is a dirty NEW entry)
            // New unmounts the editor, so confirm a discard first like onSelect.
            onNew: () => {
              if (selected.mode === "edit" && !leaveGuard.confirmLeave())
                return;
              setSelected({ mode: "new" });
            },
            onDelete: (name) => void handleDeleteEntry(name),
          })}
        </aside>
        <div className="flex-1 min-h-0 flex flex-col">
          {deletedExternally && (
            <DeletedExternallyBanner
              message={deletedBanner}
              onDiscard={() => setSelected({ mode: "new" })}
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
