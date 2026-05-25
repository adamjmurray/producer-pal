// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type SaveStatus,
  useContextMemory,
} from "#webui/hooks/context/use-context-memory";
import { MarkdownEditor } from "./MarkdownEditor";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Editor screen for the project context memory. Auto-saves on idle,
 * flushes on blur and beforeunload, refreshes when the tab becomes visible
 * (unless the editor is focused).
 * @returns Screen element
 */
export function ContextScreen(): preact.JSX.Element {
  const memory = useContextMemory();
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const focusedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryRef = useRef(memory);

  // Keep the ref current so callbacks always see the latest hook value.
  useEffect(() => {
    memoryRef.current = memory;
  });

  // Initialize the draft from the server only on first load. Subsequent
  // server status updates (from saves, AI writes, etc.) do NOT replay
  // content into the editor — once the user starts editing, the local
  // draft is authoritative (last-write-wins per spec). Replaying server
  // content mid-session caused a feedback loop whenever the device
  // normalized whitespace differently from the user's input.
  useEffect(() => {
    if (memory.status.kind !== "ready") return;
    if (draft !== null) return;

    setDraft(memory.status.content);
    draftRef.current = memory.status.content;
    lastSavedRef.current = memory.status.content;
  }, [memory.status, draft]);

  const flushSave = useCallback((): void => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const value = draftRef.current;
    const current = memoryRef.current;

    if (value === null) return;
    if (current.status.kind !== "ready") return;
    if (value === lastSavedRef.current) return;

    lastSavedRef.current = value;
    void current.save(value);
  }, []);

  const handleChange = useCallback(
    (value: string): void => {
      setDraft(value);
      draftRef.current = value;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const handleFocus = useCallback((): void => {
    focusedRef.current = true;
  }, []);

  const handleBlur = useCallback((): void => {
    focusedRef.current = false;
    flushSave();
  }, [flushSave]);

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
      <ContextHeader status={memory.status} saveStatus={memory.saveStatus} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ContextBody
          status={memory.status}
          draft={draft}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>
    </div>
  );
}

// --- Helpers below main export ---

interface ContextHeaderProps {
  status: ReturnType<typeof useContextMemory>["status"];
  saveStatus: SaveStatus;
}

/**
 * Header strip showing the title and current save indicator.
 * @param props - Header props
 * @returns Header element
 */
function ContextHeader(props: ContextHeaderProps): preact.JSX.Element {
  const { status, saveStatus } = props;

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
      <h1 className="text-base font-semibold">Project Context</h1>
      <SaveIndicator status={status} saveStatus={saveStatus} />
    </header>
  );
}

interface SaveIndicatorProps {
  status: ReturnType<typeof useContextMemory>["status"];
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

  if (status.kind === "disabled") {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        Disabled in device settings
      </span>
    );
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
  status: ReturnType<typeof useContextMemory>["status"];
  draft: string | null;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * Renders either the editor or a status message depending on memory state.
 * @param props - Body props
 * @returns Body element
 */
function ContextBody(props: ContextBodyProps): preact.JSX.Element {
  const { status, draft, onChange, onFocus, onBlur } = props;

  if (status.kind === "disabled") {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 px-8 text-center">
        Project context is disabled. Enable it in the Producer Pal device in
        Ableton Live to read or edit memory.
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="flex items-center justify-center h-full text-red-600 dark:text-red-400 px-8 text-center">
        {status.message}
      </div>
    );
  }

  if (status.kind === "loading" || draft === null) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Loading project context…
      </div>
    );
  }

  return (
    <MarkdownEditor
      value={draft}
      readOnly={false}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      className="h-full overflow-auto"
    />
  );
}
