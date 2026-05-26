// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ContextMemoryStatus,
  type SaveStatus,
  useContextMemory,
} from "#webui/hooks/context/use-context-memory";
import { MarkdownEditor } from "./MarkdownEditor";

const SAVE_DEBOUNCE_MS = 800;

interface ContextScreenProps {
  /**
   * When provided, renders a close button in the header. Used when the screen
   * is mounted inside the chat-app overlay; omitted on the standalone
   * `/context` route where the page itself is the destination.
   */
  onClose?: () => void;
}

/**
 * Editor screen for the project context memory. Auto-saves on idle and
 * flushes on blur and beforeunload. The editor is uncontrolled (seeded once
 * from the server on first ready), so a user's in-progress edits are never
 * clobbered by a server echo or AI write mid-session — last-write-wins.
 * @param props - Screen props
 * @returns Screen element
 */
export function ContextScreen(
  props: ContextScreenProps = {},
): preact.JSX.Element {
  const memory = useContextMemory();
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryRef = useRef(memory);
  // Bumped on Clear to remount the uncontrolled MarkdownEditor (state, not a
  // ref, because the editor's `key` prop is read during render).
  const [editorKey, setEditorKey] = useState(0);

  // Keep the ref current so callbacks always see the latest hook value.
  useEffect(() => {
    memoryRef.current = memory;
  });

  // Seed the draft markers from the server when memory first becomes ready.
  // Only on first ready: subsequent status updates (save echoes, AI writes,
  // toggle flips) must not blow away the user's in-progress draft.
  useEffect(() => {
    if (memory.status.kind !== "ready") return;
    if (draftRef.current != null) return;
    draftRef.current = memory.status.content;
    lastSavedRef.current = memory.status.content;
  }, [memory.status]);

  const flushSave = useCallback((): void => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const value = draftRef.current;
    const current = memoryRef.current;

    if (value == null) return;
    if (current.status.kind !== "ready") return;
    if (value === lastSavedRef.current) return;

    // Mark optimistically so a concurrent flush (debounce + blur) doesn't
    // dispatch the same content twice. On failure, roll the marker back so the
    // next flush (blur, beforeunload, or further edit) retries — unless the
    // user has since typed something newer.
    lastSavedRef.current = value;
    void current.save(value).then((saved) => {
      if (!saved && lastSavedRef.current === value) {
        lastSavedRef.current = null;
      }
    });
  }, []);

  const handleChange = useCallback(
    (value: string): void => {
      draftRef.current = value;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const handleBlur = useCallback((): void => {
    flushSave();
  }, [flushSave]);

  const handleClear = useCallback((): void => {
    if (memory.status.kind !== "ready") return;

    if (!window.confirm("Clear all project memory? This cannot be undone.")) {
      return;
    }

    // Reset draft markers so a pending debounced save doesn't echo the old
    // content back to the server before clear() lands.
    draftRef.current = "";
    lastSavedRef.current = "";

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Bump editorKey only AFTER clear() resolves: the uncontrolled
    // MarkdownEditor seeds from `status.content` at mount, and status doesn't
    // update to "" until the POST round-trips. Remounting earlier would
    // re-seed with the pre-clear content and the next edit would save it back.
    void memory.clear().then((ok) => {
      if (ok) setEditorKey((k) => k + 1);
    });
  }, [memory]);

  // Flush on tab close so an in-flight debounce doesn't drop edits.
  useEffect(() => {
    const onBeforeUnload = (): void => {
      flushSave();
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flushSave]);

  // Cleanup pending debounce on unmount.
  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200">
      <ContextHeader
        status={memory.status}
        saveStatus={memory.saveStatus}
        onClose={props.onClose}
      />
      <ContextControls
        status={memory.status}
        enabled={memory.enabled}
        writable={memory.writable}
        onEnabledChange={memory.setEnabled}
        onWritableChange={memory.setWritable}
        onClear={handleClear}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContextBody
          status={memory.status}
          enabled={memory.enabled}
          editorKey={editorKey}
          onEnable={() => void memory.setEnabled(true)}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface ContextHeaderProps {
  status: ContextMemoryStatus;
  saveStatus: SaveStatus;
  onClose?: () => void;
}

/**
 * Header strip showing the title, save indicator, and (when mounted inside
 * the chat-app overlay) a close button.
 * @param props - Header props
 * @returns Header element
 */
function ContextHeader(props: ContextHeaderProps): preact.JSX.Element {
  const { status, saveStatus, onClose } = props;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
      <h1 className="text-base font-semibold">Project Context</h1>
      <div className="flex items-center gap-3">
        <SaveIndicator status={status} saveStatus={saveStatus} />
        {onClose != null && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project context"
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
  status: ContextMemoryStatus;
  enabled: boolean;
  writable: boolean;
  onEnabledChange: (next: boolean) => Promise<boolean>;
  onWritableChange: (next: boolean) => Promise<boolean>;
  onClear: () => void;
}

/**
 * Controls strip below the header: toggles for AI read and AI-write access
 * plus a destructive clear action. Hidden until memory has loaded so we
 * don't flash a control whose state we haven't fetched yet.
 * @param props - Controls props
 * @returns Controls element (or null while loading)
 */
function ContextControls(
  props: ContextControlsProps,
): preact.JSX.Element | null {
  const {
    status,
    enabled,
    writable,
    onEnabledChange,
    onWritableChange,
    onClear,
  } = props;

  if (status.kind !== "ready") return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 text-sm">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            void onEnabledChange((e.target as HTMLInputElement).checked)
          }
        />
        Use project memory
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={writable}
          onChange={(e) =>
            void onWritableChange((e.target as HTMLInputElement).checked)
          }
        />
        AI can edit memory
      </label>
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
  status: ContextMemoryStatus;
  saveStatus: SaveStatus;
}

/**
 * Small text indicator describing the editor's read/write availability and
 * the most recent save outcome.
 * @param props - Indicator props
 * @returns Indicator element
 */
function SaveIndicator(props: SaveIndicatorProps): preact.JSX.Element {
  const { status, saveStatus } = props;

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

  if (saveStatus === "saved") {
    return (
      <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
    );
  }

  if (saveStatus === "error") {
    return (
      <span className="text-xs text-red-600 dark:text-red-400">
        Save failed
      </span>
    );
  }

  return <span className="text-xs text-zinc-500">Auto-save on</span>;
}

interface ContextBodyProps {
  status: ContextMemoryStatus;
  enabled: boolean;
  editorKey: number;
  onEnable: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Renders either the framed editor (with an inline "AI won't see this"
 * banner when memory is disabled) or a status message for loading/error.
 * The editor is mounted once per `ready` session; bumping `editorKey`
 * forces a remount (used by Clear).
 * @param props - Body props
 * @returns Body element
 */
function ContextBody(props: ContextBodyProps): preact.JSX.Element {
  const { status, enabled, editorKey, onEnable, onChange, onBlur } = props;

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
        Loading project context…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {!enabled && <DisabledBanner onEnable={onEnable} />}
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
 * Inline banner shown above the editor when project memory is disabled.
 * Replaces the old dead-end "Disabled in device settings" page so the user
 * can still read/edit their notes and re-enable AI access from here.
 * @param props - Banner props
 * @param props.onEnable - Click handler for the Enable button
 * @returns Banner element
 */
function DisabledBanner(props: { onEnable: () => void }): preact.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 text-sm">
      <span>Project memory is off — Claude won't see this.</span>
      <button
        type="button"
        onClick={props.onEnable}
        className="px-2 py-1 rounded bg-amber-200 dark:bg-amber-800/70 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-medium transition-colors"
      >
        Enable
      </button>
    </div>
  );
}
