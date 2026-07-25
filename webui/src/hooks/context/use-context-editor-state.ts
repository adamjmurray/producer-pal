// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type UseDocReturn } from "./use-doc";

const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 5000;

/** Confirm shown before an import overwrites non-empty editor content. */
const IMPORT_CONFIRM =
  "Replace the current editor content with the imported file? This can't be undone.";

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

/**
 * Every save POST currently in flight, as one promise to await before the
 * caller's own write goes out — or null when the editor is idle, so clear/import
 * reach their POST without an extra microtask hop (the single-promise ref this
 * replaced had that same fast path). Promise.all walks the set synchronously, so
 * the saves that settle (and remove themselves) afterward are still awaited.
 * @param saves - The live set of in-flight save promises
 * @returns A promise for all current saves, or null when there are none
 */
function pendingSaves(saves: Set<Promise<boolean>>): Promise<unknown> | null {
  return saves.size === 0 ? null : Promise.all(saves);
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
  /**
   * `true` when this slot is in "override" mode — it had stored content at
   * load, or the user forked the built-in (Customize) / imported a file — and
   * stays true until an explicit Reset. Drives the OverridePanes editable-vs-
   * built-in structure, LATCHED rather than derived from live content: editing
   * an override down to empty (or a debounced `save("")` echo) must not unmount
   * the editable pane mid-edit and drop the next keystrokes. Only meaningful
   * for documents with a built-in default; plain context tabs ignore it.
   */
  hasOverride: boolean;
  /** Editor `onChange` handler — updates the draft and debounces a save. */
  handleChange: (value: string) => void;
  /** Editor `onBlur` handler — flushes any pending save immediately. */
  handleBlur: () => void;
  /**
   * Confirms with the user, then clears memory after any in-flight save.
   * Resolves whether the clear actually happened (`false` when the user
   * cancels the confirm or the POST fails), so callers can gate follow-up UI
   * changes — e.g. OverridePanes only collapses the built-in reveal on an
   * actual reset.
   */
  handleClear: () => Promise<boolean>;
  /** Adopts the server's current content and remounts the editor. */
  handleReload: () => void;
  /**
   * Replaces the editor content with `content` (from an imported .md file),
   * confirming first if the current draft is non-empty. Saves the imported
   * content and remounts the editor so it re-seeds from it.
   */
  handleImport: (content: string) => Promise<void>;
  /** The editor's current draft text (includes not-yet-saved edits). */
  getContent: () => string;
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
  memory: UseDocReturn,
  clearConfirmMessage: string,
): UseContextEditorStateReturn {
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every in-flight save() promise, so handleClear/handleImport can await them
  // ALL before dispatching their own write (prevents a stale draft POST from
  // landing after theirs). A set rather than one ref: saves can overlap (a
  // debounce flush, then a blur flush before the first echo lands), and keeping
  // only the newest would silently stop awaiting the earlier one — the very
  // write-ordering hazard this is here to close.
  const inFlightSavesRef = useRef<Set<Promise<boolean>>>(new Set());
  const memoryRef = useRef(memory);
  // False once the hook has unmounted, so the unmount flush's save promise
  // can't schedule a retry or setState after teardown (a persistent failure
  // would otherwise re-POST every SAVE_RETRY_MS forever — an unbounded zombie
  // loop — and call setDirty on a dead component).
  const mountedRef = useRef(true);
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
  // True when the slot is in "override" mode (see the return-type doc). Latched
  // at the seed/lifecycle points — NOT derived from live content — so editing an
  // override down to empty doesn't structurally collapse the editable pane.
  const [hasOverride, setHasOverride] = useState(false);
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
    // Decide override-vs-built-in structure from the seed content, once.
    setHasOverride(memory.status.content !== "");
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

    // Compare against the server's canonical (trimmed) form of our baseline:
    // the Node-side stores trim on save, so our OWN save echo comes back
    // whitespace-normalized. Without this, forking a built-in that ends in a
    // newline (Customize) — or simply saving a draft with trailing blank
    // lines — would echo trimmed content that looks like an external write and
    // flash a spurious "updated outside the editor" banner. A whitespace-only
    // difference is never a meaningful external edit worth a Reload prompt.
    if (serverContent.trim() === lastSavedRef.current.trim()) {
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
    // round-trip latency). Tracked as a promise that SETTLES rather than the
    // raw one: a rejection would otherwise leave the entry in the set forever
    // and wedge every later clear/import on a rejecting Promise.all. save()
    // resolves false rather than throwing today — this keeps that from being
    // load-bearing, and routes an unexpected throw into the retry path below.
    const savePromise = current.save(value).catch(() => false);

    inFlightSavesRef.current.add(savePromise);
    void savePromise.then((saved) => {
      inFlightSavesRef.current.delete(savePromise);

      // The hook unmounted mid-save: don't touch state or reschedule. The
      // flush already went out (best-effort); retrying after teardown would
      // loop forever against a persistent failure.
      if (!mountedRef.current) return;

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

  const handleClear = useCallback(async (): Promise<boolean> => {
    if (memory.status.kind !== "ready") return false;

    if (!window.confirm(clearConfirmMessage)) {
      return false;
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

    // Wait for every in-flight save POST to complete before clear's POST goes
    // out. Without this, an older draft's POST could land AFTER clear's
    // POST and resurrect the cleared content. (The fetch promise resolves
    // only after the server has responded, so awaiting it orders the writes
    // server-side.)
    const pending = pendingSaves(inFlightSavesRef.current);

    if (pending != null) await pending;

    // Bump editorKey only AFTER clear() resolves: the uncontrolled
    // MarkdownEditor seeds from `status.content` at mount, and status doesn't
    // update to "" until the POST round-trips. Remounting earlier would
    // re-seed with the pre-clear content and the next edit would save it back.
    const ok = await memory.clear();

    if (ok) {
      setEditorKey((k) => k + 1);
      // The override is gone — revert to the built-in "Customize" view.
      setHasOverride(false);
    }

    return ok;
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
    // Re-decide structure from the adopted server content (an external clear
    // reverts to the built-in view; adopted content keeps the editable pane).
    setHasOverride(memory.status.content !== "");
    clearTimer(debounceTimerRef);
    clearTimer(retryTimerRef);
    setEditorKey((k) => k + 1);
  }, [memory.status]);

  const handleImport = useCallback(
    async (content: string): Promise<void> => {
      if (memory.status.kind !== "ready") return;

      // Guard against clobbering in-progress work. An empty editor imports
      // silently (the common "start from a file" case).
      const current = draftRef.current ?? "";

      if (current.trim() !== "" && !window.confirm(IMPORT_CONFIRM)) return;

      // Adopt the imported content as the new baseline, then remount — mirrors
      // handleClear/handleReload so draft markers, size readout, and the editor
      // seed stay consistent.
      draftRef.current = content;
      lastSavedRef.current = content;
      setExternalUpdate(false);
      setDirty(false);
      setCharCount(content.length);

      clearTimer(debounceTimerRef);
      clearTimer(retryTimerRef);

      // Order the import POST after every in-flight save so a stale draft POST
      // can't land after it and resurrect the old content (see handleClear).
      const pending = pendingSaves(inFlightSavesRef.current);

      if (pending != null) await pending;

      const ok = await memory.save(content);

      if (ok) {
        setEditorKey((k) => k + 1);
        // Imported/forked content means the slot now overrides the built-in.
        setHasOverride(true);
      }
    },
    [memory],
  );

  const getContent = useCallback((): string => draftRef.current ?? "", []);

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
      mountedRef.current = false;
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
    hasOverride,
    handleChange,
    handleBlur,
    handleClear,
    handleReload,
    handleImport,
    getContent,
    charCount,
  };
}
