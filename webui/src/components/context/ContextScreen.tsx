// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
import { TrashIcon } from "#webui/components/chat/controls/header/HeaderIcons";
import { useContextEditorState } from "#webui/hooks/context/use-context-editor-state";
import {
  type DocDrift,
  type DocMemoryStatus,
  type UseDocMemoryReturn,
} from "#webui/hooks/context/use-doc-memory";
import { CharTokenCount } from "./collection/CharTokenCount";
import { makeContextIoHandlers } from "./context-io";
import { ContextIoButtons } from "./ContextIoButtons";
import { ContextHeader } from "./editor/ContextHeader";
import { DriftNote } from "./editor/DriftNote";
import { OverridePanes } from "./editor/OverridePanes";
import { MarkdownDropZone } from "./MarkdownDropZone";
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
  /**
   * Human basename for the `.md` export file (e.g.
   * "producer-pal-global-context"); dated and slugified at download time.
   */
  exportBasename: string;
  /** Banner text when the server content changed under a clean draft. */
  externalUpdateMessage: string;

  // Optional framing + built-in-reference mode (the custom-instructions tab):

  /**
   * Optional one-line explainer shown in the controls strip (e.g. the custom
   * instructions tab warns that its content fully replaces the built-in
   * prompt). Omitted for documents that need no framing.
   */
  description?: string;
  /**
   * Optional read-only built-in reference. When set, the editor renders
   * side-by-side (editable override | built-in with a Copy button) so a user
   * can fork the shipped default instead of starting from a blank slate. Used
   * by the custom-instructions tab; the plain context tabs (no shipped default)
   * omit it and stay single-pane.
   */
  builtIn?: string;
  /**
   * Label above the editable pane in side-by-side mode (e.g. "Your
   * instructions"). Only meaningful when `builtIn` is set.
   */
  overridePaneLabel?: string;
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
  const io = makeContextIoHandlers(editor, labels.exportBasename);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  // Cap the editable region so it lines up with the chat column instead of
  // sprawling across a wide monitor. At rest the editor matches the chat width;
  // it widens to the two-column layout only while the built-in reference is
  // revealed, so neither pane is cramped (editors too wide on 4K). Resetting
  // collapses the reveal (see OverridePanes), so the built-in-only view that
  // follows a reset stays single-column.
  const widthClass =
    labels.builtIn != null && showBuiltIn ? DOUBLE_PANE_WIDTH : SINGLE_WIDTH;

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
        description={labels.description}
        widthClass={widthClass}
        charCount={editor.charCount}
        builtIn={labels.builtIn}
        hasOverride={editor.hasOverride}
        drift={memory.drift}
        onClear={() => void editor.handleClear()}
        onImport={io.onImport}
        onExport={io.onExport}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContextBody
          status={memory.status}
          loadingLabel={labels.loadingLabel}
          externalUpdateMessage={labels.externalUpdateMessage}
          builtIn={labels.builtIn}
          overridePaneLabel={labels.overridePaneLabel}
          showBuiltIn={showBuiltIn}
          onToggleBuiltIn={setShowBuiltIn}
          widthClass={widthClass}
          editorKey={editor.editorKey}
          hasOverride={editor.hasOverride}
          externalUpdate={editor.externalUpdate}
          onReload={editor.handleReload}
          onReset={editor.handleClear}
          onCustomize={() => void editor.handleImport(labels.builtIn ?? "")}
          onChange={editor.handleChange}
          onBlur={editor.handleBlur}
          onImportText={io.onImportText}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Single-pane editor width (matches the chat column, `max-w-5xl`). Exported so
 * the skills editor uses the same at-rest width when its built-in is hidden.
 */
export const SINGLE_WIDTH = "max-w-5xl";

/**
 * Side-by-side editor width — a little wider than the chat column so neither
 * pane is cramped. Exported so the skills editor (also side-by-side) matches.
 */
export const DOUBLE_PANE_WIDTH = "max-w-7xl";

interface ContextControlsProps {
  status: DocMemoryStatus;
  description?: string;
  widthClass: string;
  charCount: number;
  /**
   * The document's built-in default, when it has one (custom instructions). Its
   * presence hides the strip Clear (reset lives in the revealed built-in header)
   * and, with no override yet, makes the size readout reflect the built-in shown
   * on screen rather than the empty override.
   */
  builtIn?: string;
  /**
   * Whether the slot has an override (latched; see `useContextEditorState`). In
   * override mode the size readout reflects the draft; otherwise it shows the
   * built-in that's on screen. Latched so editing the override to empty doesn't
   * flip the readout to "Built-in" mid-edit.
   */
  hasOverride: boolean;
  /**
   * Fork-time drift for the document, when it overrides a built-in (custom
   * instructions). Renders a "default changed since you forked" note; undefined
   * for documents with no built-in (project/global).
   */
  drift?: DocDrift;
  onClear: () => void;
  onImport: () => void;
  onExport: () => void;
}

/**
 * Controls strip below the header with an optional explainer, a live char/token
 * size readout (labelled "Default" while an un-customized default is shown, so
 * the count matches what's on screen), and (for documents without a built-in
 * default) a destructive clear action. Hidden until memory has loaded so we
 * don't flash a control whose state we haven't fetched yet. The border spans
 * full width while the content is centered to `widthClass` so it lines up with
 * the editor below.
 * @param props - Controls props
 * @returns Controls element (or null while loading)
 */
function ContextControls(
  props: ContextControlsProps,
): preact.JSX.Element | null {
  const { status, description, widthClass, charCount, builtIn } = props;
  const { hasOverride, drift, onClear, onImport, onExport } = props;

  if (status.kind !== "ready") return null;

  // With a built-in default and no override yet, the strip's size readout must
  // reflect the default that's actually on screen (not the empty override).
  // Keyed off the latched override flag, NOT live content, so editing an
  // override to empty doesn't momentarily flip the readout to "Default".
  const builtInShown = builtIn != null && !hasOverride;

  return (
    <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <div className={`mx-auto w-full ${widthClass} flex items-center gap-3`}>
        {description != null && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <DriftNote
            drifted={drift?.drifted ?? false}
            forkedFromVersion={drift?.forkedFromVersion ?? null}
          />
          <CharTokenCount
            chars={builtInShown ? builtIn.length : charCount}
            label={builtInShown ? "Default" : undefined}
            className="shrink-0"
          />
          <ContextIoButtons onImport={onImport} onExport={onExport} />
          {builtIn == null && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear"
              title="Clear"
              className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 transition-colors"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ContextBodyProps {
  status: DocMemoryStatus;
  loadingLabel: string;
  externalUpdateMessage: string;
  builtIn?: string;
  overridePaneLabel?: string;
  showBuiltIn: boolean;
  onToggleBuiltIn: (show: boolean) => void;
  widthClass: string;
  editorKey: number;
  hasOverride: boolean;
  externalUpdate: boolean;
  onReload: () => void;
  /** See {@link OverridePanes}: resolves whether the reset actually happened. */
  onReset: () => Promise<boolean>;
  onCustomize: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  onImportText: (text: string) => void;
}

/**
 * Renders either the framed editor (with an external-update banner when
 * the server has changed under us) or a status message for loading/error.
 * The editor is mounted once per `ready` session; bumping `editorKey`
 * forces a remount (used by Clear and Reload). When `builtIn` is supplied the
 * editor renders side-by-side with the read-only default (see OverridePanes).
 * @param props - Body props
 * @returns Body element
 */
function ContextBody(props: ContextBodyProps): preact.JSX.Element {
  const {
    status,
    loadingLabel,
    externalUpdateMessage,
    builtIn,
    overridePaneLabel,
    showBuiltIn,
    onToggleBuiltIn,
    widthClass,
    editorKey,
    hasOverride,
    externalUpdate,
    onReload,
    onReset,
    onCustomize,
    onChange,
    onBlur,
    onImportText,
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
    <div
      className={`mx-auto w-full ${widthClass} flex flex-col h-full p-4 gap-3 overflow-hidden`}
    >
      {externalUpdate && (
        <ExternalUpdateBanner
          message={externalUpdateMessage}
          onReload={onReload}
        />
      )}
      <MarkdownDropZone
        onImportText={onImportText}
        className="flex-1 min-h-0 flex flex-col"
      >
        {builtIn != null ? (
          <OverridePanes
            editorKey={editorKey}
            hasOverride={hasOverride}
            value={status.content}
            builtIn={builtIn}
            overrideLabel={overridePaneLabel ?? "Your override"}
            showBuiltIn={showBuiltIn}
            onToggleBuiltIn={onToggleBuiltIn}
            onReset={onReset}
            onCustomize={onCustomize}
            onChange={onChange}
            onBlur={onBlur}
          />
        ) : (
          <MarkdownEditor
            key={editorKey}
            initialValue={status.content}
            readOnly={false}
            onChange={onChange}
            onBlur={onBlur}
            className="flex-1 min-h-0"
          />
        )}
      </MarkdownDropZone>
    </div>
  );
}

/**
 * Inline banner shown above the editor when the server-side content has
 * changed externally (AI write, Max device button) and the user has no
 * in-progress draft. Clicking Reload adopts the server's content as the new
 * baseline and remounts the editor. Exported so the skills editor reuses the
 * same external-write affordance.
 * @param props - Banner props
 * @param props.message - Banner copy for this document type
 * @param props.onReload - Click handler for the Reload button
 * @returns Banner element
 */
export function ExternalUpdateBanner(props: {
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
