// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import {
  type DocMemoryStatus,
  type SaveStatus,
  type UseDocMemoryReturn,
} from "#webui/hooks/context/use-doc-memory";
import { MarkdownEditor } from "./MarkdownEditor";

/** Copy that distinguishes one document editor (project vs. global context). */
export interface ContextEditorLabels {
  /** Header title, shown when no `tabSlot` replaces it. */
  title: string;
  /** Body text while the document is loading. */
  loadingLabel: string;
  /** aria-label for the close button. */
  closeAriaLabel: string;
  /** Confirm prompt shown before Clear wipes the document. */
  clearConfirmMessage: string;
  /** Banner text when the server content changed under a clean draft. */
  externalUpdateMessage: string;
}

interface ContextScreenProps {
  /** Document memory hook return for this editor (project or global). */
  memory: UseDocMemoryReturn;
  /** Copy for this document type. */
  labels: ContextEditorLabels;
  /**
   * Header-left navigation (the Project | Global tab strip). When provided it
   * replaces the plain title; each tab remounts this screen (via `key`) so the
   * editor re-seeds from the newly-active document.
   */
  tabSlot?: preact.JSX.Element;
  /**
   * When provided, renders a close button in the header. Used when the screen
   * is mounted inside the chat-app overlay; omitted on the standalone
   * `/context` route where the page itself is the destination.
   */
  onClose?: () => void;
}

/**
 * Editor screen for a single markdown document (project or global context).
 * Auto-saves on idle and flushes on blur and beforeunload. The editor is
 * uncontrolled (seeded once from the server on first ready), so a user's
 * in-progress edits are never clobbered by a server echo or AI write
 * mid-session — last-write-wins. Surfaces a Reload banner when the server has
 * changed and the draft is clean, so external writes aren't silently discarded.
 * @param props - Screen props
 * @returns Screen element
 */
export function ContextScreen(props: ContextScreenProps): preact.JSX.Element {
  const { memory, labels, tabSlot, onClose } = props;
  const editor = useContextEditorState(memory, labels.clearConfirmMessage);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        title={labels.title}
        tabSlot={tabSlot}
        closeAriaLabel={labels.closeAriaLabel}
        status={memory.status}
        saveStatus={memory.saveStatus}
        dirty={editor.dirty}
        onClose={onClose}
      />
      <ContextControls
        status={memory.status}
        onClear={() => void editor.handleClear()}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContextBody
          status={memory.status}
          loadingLabel={labels.loadingLabel}
          externalUpdateMessage={labels.externalUpdateMessage}
          editorKey={editor.editorKey}
          externalUpdate={editor.externalUpdate}
          onReload={editor.handleReload}
          onChange={editor.handleChange}
          onBlur={editor.handleBlur}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface ContextHeaderProps {
  title: string;
  tabSlot?: preact.JSX.Element;
  closeAriaLabel: string;
  status: DocMemoryStatus;
  saveStatus: SaveStatus;
  dirty: boolean;
  onClose?: () => void;
}

/**
 * Header strip showing the title (or tab strip), save indicator, and (when
 * mounted inside the chat-app overlay) a close button.
 * @param props - Header props
 * @returns Header element
 */
function ContextHeader(props: ContextHeaderProps): preact.JSX.Element {
  const { title, tabSlot, closeAriaLabel, status, saveStatus, dirty, onClose } =
    props;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
      {tabSlot ?? <h1 className="text-base font-semibold">{title}</h1>}
      <div className="flex items-center gap-3">
        <SaveIndicator status={status} saveStatus={saveStatus} dirty={dirty} />
        {onClose != null && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            title="Close (Esc)"
            className="p-1 -mr-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 4L14 14M14 4L4 14" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

interface ContextControlsProps {
  status: DocMemoryStatus;
  onClear: () => void;
}

/**
 * Controls strip below the header with a destructive clear action. Hidden
 * until memory has loaded so we don't flash a control whose state we
 * haven't fetched yet.
 * @param props - Controls props
 * @returns Controls element (or null while loading)
 */
function ContextControls(
  props: ContextControlsProps,
): preact.JSX.Element | null {
  const { status, onClear } = props;

  if (status.kind !== "ready") return null;

  return (
    <div className="flex items-center px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}

interface SaveIndicatorProps {
  status: DocMemoryStatus;
  saveStatus: SaveStatus;
  dirty: boolean;
}

/**
 * Small text indicator describing the editor's read/write availability and
 * the most recent save outcome.
 * @param props - Indicator props
 * @returns Indicator element
 */
function SaveIndicator(props: SaveIndicatorProps): preact.JSX.Element {
  const { status, saveStatus, dirty } = props;

  if (status.kind === "loading") {
    return <span className="text-xs text-zinc-500">Loading…</span>;
  }

  if (status.kind === "error") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        {status.message}
      </span>
    );
  }

  if (saveStatus === "saving") {
    return <span className="text-xs text-zinc-500">Saving…</span>;
  }

  if (saveStatus === "error") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        Save failed
      </span>
    );
  }

  // "Editing…" beats "Saved" when the user has typed more since the last
  // save — otherwise "Saved" would linger through the debounce window.
  if (dirty) {
    return <span className="text-xs text-zinc-500">Editing…</span>;
  }

  if (saveStatus === "saved") {
    return (
      <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
    );
  }

  return <span className="text-xs text-zinc-500">Auto-save on</span>;
}

interface ContextBodyProps {
  status: DocMemoryStatus;
  loadingLabel: string;
  externalUpdateMessage: string;
  editorKey: number;
  externalUpdate: boolean;
  onReload: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Renders either the framed editor (with an external-update banner when
 * the server has changed under us) or a status message for loading/error.
 * The editor is mounted once per `ready` session; bumping `editorKey`
 * forces a remount (used by Clear and Reload).
 * @param props - Body props
 * @returns Body element
 */
function ContextBody(props: ContextBodyProps): preact.JSX.Element {
  const {
    status,
    loadingLabel,
    externalUpdateMessage,
    editorKey,
    externalUpdate,
    onReload,
    onChange,
    onBlur,
  } = props;

  if (status.kind === "error") {
    return (
      <div className="flex items-center justify-center h-full text-red-600 dark:text-red-400 px-8 text-center">
        {status.message}
      </div>
    );
  }

  if (status.kind === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        {loadingLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {externalUpdate && (
        <ExternalUpdateBanner
          message={externalUpdateMessage}
          onReload={onReload}
        />
      )}
      <MarkdownEditor
        key={editorKey}
        initialValue={status.content}
        readOnly={false}
        onChange={onChange}
        onBlur={onBlur}
        className="flex-1 min-h-0"
      />
    </div>
  );
}

/**
 * Inline banner shown above the editor when the server-side content has
 * changed externally (AI write, Max device button) and the user has no
 * in-progress draft. Clicking Reload adopts the server's content as the new
 * baseline and remounts the editor.
 * @param props - Banner props
 * @param props.message - Banner copy for this document type
 * @param props.onReload - Click handler for the Reload button
 * @returns Banner element
 */
function ExternalUpdateBanner(props: {
  message: string;
  onReload: () => void;
}): preact.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-700/60 text-sky-800 dark:text-sky-200 text-sm">
      <span>{props.message}</span>
      <button
        type="button"
        onClick={props.onReload}
        className="px-2 py-1 rounded bg-sky-200 dark:bg-sky-800/70 hover:bg-sky-300 dark:hover:bg-sky-700 text-sky-900 dark:text-sky-100 text-xs font-medium transition-colors"
      >
        Reload
      </button>
    </div>
  );
}
