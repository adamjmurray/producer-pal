// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type UseDocMemoryReturn } from "./use-doc-memory";

const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 5000;

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

/**
 * Clear a setTimeout ref if armed, and null it out.
 * @param ref - The timer ref to clear
 */
function clearTimer(ref: TimerRef): void {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

export interface UseContextEditorStateReturn {
  /**
   * Bumped on Clear / Reload-from-server to remount the uncontrolled
   * `MarkdownEditor` so it re-seeds from the current `status.content`.
   */
  editorKey: number;
  /**
   * `true` when the server's content has diverged from the editor's
   * baseline (AI/device write) AND the user has no in-progress draft —
   * surfaces a "Reload" banner so the user can adopt the server's content.
   */
  externalUpdate: boolean;
  /**
   * `true` when the draft has unsaved changes (typed since the last
   * successful save). Drives the "Editing…" indicator so "Saved" doesn't
   * linger after the user has typed more.
   */
  dirty: boolean;
  /** Editor `onChange` handler — updates the draft and debounces a save. */
  handleChange: (value: string) => void;
  /** Editor `onBlur` handler — flushes any pending save immediately. */
  handleBlur: () => void;
  /** Confirms with the user, then clears memory after any in-flight save. */
  handleClear: () => Promise<void>;
  /** Adopts the server's current content and remounts the editor. */
  handleReload: () => void;
  /**
   * Live character count of the editor's current draft — seeded from the
   * server, updated on each keystroke, reset by Clear/Reload. Drives the
   * char/token size readout in the controls strip.
   */
  charCount: number;
}

/**
 * Editor state + save lifecycle for `ContextScreen`. Owns the uncontrolled
 * editor's draft markers, debounced/retried autosave, beforeunload flush,
 * error-recovery reset, external-update detection, and the Clear/Reload
 * remount keys. Split out from `ContextScreen.tsx` to keep that component
 * focused on layout while exercising this logic in isolation.
 * @param memory - A document memory hook return (project or global context)
 * @param clearConfirmMessage - Confirm prompt shown before clearing the doc
 * @returns Editor state + handlers wired for the screen
 */
export function useContextEditorState(
  memory: UseDocMemoryReturn,
  clearConfirmMessage: string,
): UseContextEditorStateReturn {
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the most recent in-flight save() promise so handleClear can await
  // it (prevents a stale draft POST from landing after clear's POST).
  const inFlightSaveRef = useRef<Promise<boolean> | null>(null);
  const memoryRef = useRef(memory);
  // Bumped on Clear / Reload to remount the uncontrolled MarkdownEditor
  // (state, not a ref, because the editor's `key` prop is read during render).
  const [editorKey, setEditorKey] = useState(0);
  // True when the server's content diverges from what the editor last saw
  // (AI/device wrote externally) AND the user has no in-progress draft.
  const [externalUpdate, setExternalUpdate] = useState(false);
  // True when the draft differs from the last successfully-saved value.
  // Drives the "Editing…" indicator so "Saved" doesn't linger after the
  // user has typed more in the debounce window between save and re-save.
  const [dirty, setDirty] = useState(false);
  // Live character count of the draft (draftRef is a ref, so a separate piece
  // of reactive state drives the size readout). Kept in sync at every point
  // draftRef changes: seed-on-ready, keystroke, Clear, Reload.
  const [charCount, setCharCount] = useState(0);

  // Seed the draft markers from the server when memory first becomes ready.
  // Only on first ready: subsequent status updates (save echoes, AI writes,
  // toggle flips) must not blow away the user's in-progress draft.
  useEffect(() => {
    if (memory.status.kind !== "ready") return;
    if (draftRef.current != null) return;
    draftRef.current = memory.status.content;
    lastSavedRef.current = memory.status.content;
    setCharCount(memory.status.content.length);
  }, [memory.status]);

  // Null the draft markers on transition to error. Without this, a recovery
  // (error → ready) leaves the refs pointed at the pre-error value because
  // the seed-on-first-ready effect above bails when draftRef is set; a
  // subsequent beforeunload would then flush the stale value over the
  // server's recovered content.
  useEffect(() => {
    if (memory.status.kind !== "error") return;
    draftRef.current = null;
    lastSavedRef.current = null;
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(0);
  }, [memory.status]);

  // Surface an "external update" banner when an AI/device write changes
  // status.content out from under the uncontrolled editor AND the user has
  // no in-progress diff (draftRef === lastSavedRef). Clean-draft is the
  // safe case — reloading discards nothing the user typed.
  useEffect(() => {
    if (memory.status.kind !== "ready") return;
    if (lastSavedRef.current == null) return;
    const serverContent = memory.status.content;

    if (serverContent === lastSavedRef.current) {
      setExternalUpdate(false);

      return;
    }

    if (draftRef.current !== lastSavedRef.current) return;
    setExternalUpdate(true);
  }, [memory.status]);

  // Ref-indirected so flushSave can schedule a retry via setTimeout(flushSave)
  // without tripping the no-use-before-defined rule on its own const binding.
  // null until useEffect installs the actual flushSave below.
  const flushSaveRef = useRef<(() => void) | null>(null);
  const flushSave = useCallback((): void => {
    // The retry timer is a fallback for an unattended user; clearing both
    // here ensures the next failure schedules a fresh retry from this attempt.
    clearTimer(debounceTimerRef);
    clearTimer(retryTimerRef);

    const value = draftRef.current;
    const current = memoryRef.current;

    if (value == null) return;
    if (current.status.kind !== "ready") return;
    if (value === lastSavedRef.current) return;

    // Mark optimistically so a concurrent flush (debounce + blur) doesn't
    // dispatch the same content twice. On failure, roll the marker back so the
    // next flush (blur, beforeunload, or further edit) retries — unless the
    // user has since typed something newer. Also schedule an unattended retry
    // so a transient failure doesn't lose edits when the user has walked away.
    lastSavedRef.current = value;
    // Track the in-flight save so handleClear can await it before dispatching
    // clear (orders the writes on the wire — clear already accepts the
    // round-trip latency).
    const savePromise = current.save(value);

    inFlightSaveRef.current = savePromise;
    void savePromise.then((saved) => {
      if (inFlightSaveRef.current === savePromise) {
        inFlightSaveRef.current = null;
      }

      if (saved) {
        // Only clear dirty if the user hasn't typed past the saved value
        // during the in-flight save — otherwise more edits are still pending.
        if (draftRef.current === lastSavedRef.current) {
          setDirty(false);
        }
      } else if (lastSavedRef.current === value) {
        lastSavedRef.current = null;
        retryTimerRef.current = setTimeout(
          () => flushSaveRef.current?.(),
          SAVE_RETRY_MS,
        );
      }
    });
  }, []);

  // Keep refs current so callbacks always see the latest hook value.
  useEffect(() => {
    memoryRef.current = memory;
    flushSaveRef.current = flushSave;
  });

  const handleChange = useCallback(
    (value: string): void => {
      draftRef.current = value;
      setCharCount(value.length);
      // Compare against lastSavedRef so reverting to the saved value clears
      // the dirty flag (covers undo-back-to-saved). lastSavedRef is null
      // briefly after a failed save (rolled back for retry), in which case
      // any new content is considered dirty.
      setDirty(value !== lastSavedRef.current);
      // Typing dismisses the external-update banner: the user has chosen to
      // keep editing, which under last-write-wins implicitly overrides the
      // server's external content on the next save.
      setExternalUpdate(false);

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

  const handleClear = useCallback(async (): Promise<void> => {
    if (memory.status.kind !== "ready") return;

    if (!window.confirm(clearConfirmMessage)) {
      return;
    }

    // Reset draft markers so a pending debounced save doesn't echo the old
    // content back to the server before clear() lands.
    draftRef.current = "";
    lastSavedRef.current = "";
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(0);

    clearTimer(debounceTimerRef);
    clearTimer(retryTimerRef);

    // Wait for any in-flight save POST to complete before clear's POST goes
    // out. Without this, the older draft's POST could land AFTER clear's
    // POST and resurrect the cleared content. (The fetch promise resolves
    // only after the server has responded, so awaiting it orders the writes
    // server-side.)
    const pending = inFlightSaveRef.current;

    if (pending != null) await pending;

    // Bump editorKey only AFTER clear() resolves: the uncontrolled
    // MarkdownEditor seeds from `status.content` at mount, and status doesn't
    // update to "" until the POST round-trips. Remounting earlier would
    // re-seed with the pre-clear content and the next edit would save it back.
    const ok = await memory.clear();

    if (ok) setEditorKey((k) => k + 1);
  }, [memory, clearConfirmMessage]);

  const handleReload = useCallback((): void => {
    if (memory.status.kind !== "ready") return;
    // Adopt the server's content as the new baseline and remount the editor.
    // Only offered when no in-progress diff exists, so this discards nothing
    // the user typed.
    draftRef.current = memory.status.content;
    lastSavedRef.current = memory.status.content;
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(memory.status.content.length);
    clearTimer(debounceTimerRef);
    clearTimer(retryTimerRef);
    setEditorKey((k) => k + 1);
  }, [memory.status]);

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

  // Flush any pending debounced save on unmount before clearing timers, so a
  // fast type → Esc (which unmounts the editor inside the debounce window)
  // doesn't drop edits. flushSave clears its own timers, so the explicit
  // clearTimer calls below are belt-and-suspenders for the bail-out paths
  // (no draft yet, no changes, status not ready).
  useEffect(
    () => () => {
      flushSaveRef.current?.();
      clearTimer(debounceTimerRef);
      clearTimer(retryTimerRef);
    },
    [],
  );

  return {
    editorKey,
    externalUpdate,
    dirty,
    handleChange,
    handleBlur,
    handleClear,
    handleReload,
    charCount,
  };
}
