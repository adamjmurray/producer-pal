// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef } from "preact/hooks";
import {
  type SaveStatus,
  useContextMemory,
} from "#webui/hooks/context/use-context-memory";
import { MarkdownEditor } from "./MarkdownEditor";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Editor screen for the project context memory. Auto-saves on idle and
 * flushes on blur and beforeunload. The editor is uncontrolled (seeded once
 * from the server on first ready), so a user's in-progress edits are never
 * clobbered by a server echo or AI write mid-session — last-write-wins.
 * @returns Screen element
 */
export function ContextScreen(): preact.JSX.Element {
  const memory = useContextMemory();
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryRef = useRef(memory);

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
          onChange={handleChange}
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
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Renders either the framed editor or a status message depending on memory
 * state. The editor is mounted once per `ready` session — its content is
 * seeded from the server then owned by CodeMirror.
 * @param props - Body props
 * @returns Body element
 */
function ContextBody(props: ContextBodyProps): preact.JSX.Element {
  const { status, onChange, onBlur } = props;

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

  if (status.kind === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Loading project context…
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-hidden">
      <MarkdownEditor
        initialValue={status.content}
        readOnly={false}
        onChange={onChange}
        onBlur={onBlur}
        className="h-full"
      />
    </div>
  );
}
