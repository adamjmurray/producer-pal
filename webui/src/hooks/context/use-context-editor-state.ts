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
 * Every write POST currently in flight, as one promise to await before the
 * caller's own write goes out — or null when the editor is idle, so a write
 * reaches its POST without an extra microtask hop (the single-promise ref this
 * replaced had that same fast path). The null matters beyond latency: an
 * autosave flush during beforeunload only lands if it dispatches in the same
 * turn. Promise.all walks the set synchronously, so the saves that settle (and
 * remove themselves) afterward are still awaited.
 * @param saves - The live set of in-flight save promises
 * @returns A promise for all current saves, or null when there are none
 */
function pendingSaves(saves: Set<Promise<boolean>>): Promise<unknown> | null {
  return saves.size === 0 ? null : Promise.all(saves);
}

/**
 * Dispatch a manual write (Clear / Import / the Skills Include toggle) ordered
 * behind every save already in flight, and register it in `saves` so the NEXT
 * manual write is ordered behind
 * IT too. Both halves matter: without the registration, an Import→Clear (or
 * Clear→Import) pair finds an empty set and puts two writes on the wire at once.
 * The UI still resolves correctly — use-doc's generation counter discards the
 * superseded echo — but the file on disk keeps whichever PUT the server happened
 * to handle last, so a poll can resurrect content the user just cleared.
 *
 * Chaining and registration are both SYNCHRONOUS, before any await — the same
 * shape as flushSave. Awaiting `pending` first and registering afterwards would
 * leave a window in which a second manual write reads a pre-registration
 * snapshot of `saves`: with an autosave already in flight, a Clear and an Import
 * would compute the same `pending`, then both resume when it settles and put two
 * writes on the wire anyway. Only the DISPATCH defers.
 * @param saves - The live set of in-flight write promises
 * @param write - Dispatches the write; called only once the pending ones settle
 * @returns Whether the write succeeded
 */
async function dispatchOrderedWrite(
  saves: Set<Promise<boolean>>,
  write: () => Promise<boolean>,
): Promise<boolean> {
  const pending = pendingSaves(saves);
  // Registered as a promise that SETTLES, matching flushSave: a rejection left
  // in the set would wedge every later clear/import on a rejecting Promise.all.
  // save()/clear() resolve false rather than throwing today — this keeps that
  // from being load-bearing. pendingSaves' null fast path keeps the idle case
  // dispatching in this very turn.
  const dispatched = (
    pending == null ? write() : pending.then(() => write())
  ).catch(() => false);

  saves.add(dispatched);

  const ok = await dispatched;

  saves.delete(dispatched);

  return ok;
}

/** What {@link replaceDocument} needs from the editor's state. */
interface ReplaceContext {
  draftRef: { current: string | null };
  lastSavedRef: { current: string | null };
  debounceTimerRef: TimerRef;
  retryTimerRef: TimerRef;
  /** How many Clear/Import writes are on the wire (see the hook's ref). */
  replacingRef: { current: number };
  /** The live set of in-flight write promises. */
  saves: Set<Promise<boolean>>;
  setCharCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  setEditorKey: (update: (key: number) => number) => void;
}

/**
 * Replace the whole document — the shape Clear and Import share. Stage the new
 * content in the draft markers so a pending debounced save can't echo the old
 * content out first, dispatch the write ordered behind everything already on
 * the wire, then remount the editor on the result or put the markers back.
 *
 * The editor stays live through the round trip (it can only remount once the
 * echo lands, since it seeds from `status.content`), so the user can type into
 * content that is about to disappear. `replacingRef` holds the autosave off for
 * exactly that window and the success path re-stages, discarding the draft —
 * ordering it behind the replace instead would just make it land LAST, writing
 * text to disk that the remount then hides.
 *
 * @param ctx - The editor's draft markers, timers, and in-flight write set
 * @param content - What the document becomes ("" for a Clear)
 * @param write - Dispatches the POST
 * @returns Whether the replacement was persisted
 */
async function replaceDocument(
  ctx: ReplaceContext,
  content: string,
  write: () => Promise<boolean>,
): Promise<boolean> {
  const previousDraft = ctx.draftRef.current;

  stageDraft(ctx, content);
  ctx.replacingRef.current += 1;

  let ok = false;

  try {
    ok = await dispatchOrderedWrite(ctx.saves, write);
  } finally {
    ctx.replacingRef.current -= 1;
  }

  if (ok) {
    stageDraft(ctx, content);
    ctx.setEditorKey((key) => key + 1);

    return true;
  }

  // Nothing remounted and the server still holds the old content, so leaving
  // the markers forward would make getContent() (Export) and the size readout
  // describe text nobody can see, with nothing to retry it. A draft typed since
  // is kept — only the baseline goes back, leaving it dirty for the next flush.
  if (ctx.draftRef.current === content) {
    ctx.draftRef.current = previousDraft;
    ctx.setCharCount(previousDraft?.length ?? 0);
  }

  ctx.lastSavedRef.current = previousDraft;
  ctx.setDirty(ctx.draftRef.current !== previousDraft);

  return false;
}

/**
 * Point the draft markers at `content` and cancel the save timers, so nothing
 * armed for the old content still fires.
 * @param ctx - The editor's draft markers and timers
 * @param content - The content to stage
 */
function stageDraft(ctx: ReplaceContext, content: string): void {
  clearTimer(ctx.debounceTimerRef);
  clearTimer(ctx.retryTimerRef);
  ctx.draftRef.current = content;
  ctx.lastSavedRef.current = content;
  ctx.setCharCount(content.length);
  ctx.setDirty(false);
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
   * load, or the user forked the built-in by typing into it
   * ({@link UseContextEditorStateReturn.beginOverride}) / imported a file — and
   * stays true until an explicit Reset. Drives the OverridePanes built-in-vs-
   * override framing, LATCHED rather than derived from live content: editing an
   * override down to empty (or a debounced `save("")` echo) must not revert the
   * pane to its built-in framing mid-edit. Only meaningful for documents with a
   * built-in default; plain context tabs ignore it.
   */
  hasOverride: boolean;
  /** Editor `onChange` handler — updates the draft and debounces a save. */
  handleChange: (value: string) => void;
  /** Editor `onBlur` handler — flushes any pending save immediately. */
  handleBlur: () => void;
  /**
   * Confirms with the user, then clears the doc after any in-flight save.
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
  /**
   * Latches `hasOverride` on, without touching the draft, the save lifecycle,
   * or the editor mount. Called on the first edit made in a pane still showing
   * its built-in default: the editor is already seeded with that default, so the
   * edit's own debounced save persists the fork — this only flips the chrome.
   * Idempotent, so the pane can call it on every keystroke it isn't sure about.
   */
  beginOverride: () => void;
  /** The editor's current draft text (includes not-yet-saved edits). */
  getContent: () => string;
  /**
   * Run a write that targets the same file the editor autosaves, ordered behind
   * every write already in flight and registered so the next one orders behind
   * IT. For writes the editor itself doesn't own — the Skills "Include" toggle,
   * which PUTs the same slot file. Without it a toggle fired during an in-flight
   * body save can land first and echo the pre-edit body, which then wins the
   * merge and gets offered as a "Reload" over the user's own text.
   */
  dispatchWrite: (write: () => Promise<boolean>) => Promise<boolean>;
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
 * @param doc - A document hook return (project or global context)
 * @param clearConfirmMessage - Confirm prompt shown before clearing the doc
 * @returns Editor state + handlers wired for the screen
 */
export function useContextEditorState(
  doc: UseDocReturn,
  clearConfirmMessage: string,
): UseContextEditorStateReturn {
  const draftRef = useRef<string | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every in-flight write promise — autosave flushes AND the manual
  // Clear/Import writes. Every write both registers here and orders behind
  // what it finds, so only one PUT is ever on the wire and the server sees them
  // in the order the user triggered them. Symmetric on purpose: leaving any one
  // write out (autosave was, once) reopens the hazard from that direction —
  // the UI still resolves correctly, because use-doc's generation counter
  // discards the superseded echo, but the file on disk keeps whichever PUT the
  // server happened to finish last. A set rather than one ref: writes can
  // overlap (a debounce flush, then a blur flush before the first echo lands),
  // and keeping only the newest would silently stop awaiting the earlier one.
  const inFlightSavesRef = useRef<Set<Promise<boolean>>>(new Set());
  // How many Clear/Import writes are on the wire. Those two REPLACE the whole
  // document and remount the editor from the result, so a draft typed while one
  // is in flight is discarded by that remount — see flushSave for why it must
  // not be saved. A counter, not a flag: the two can overlap.
  const replacingRef = useRef(0);
  const docRef = useRef(doc);
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

  // Seed the draft markers from the server when the doc first becomes ready.
  // Only on first ready: subsequent status updates (save echoes, AI writes,
  // toggle flips) must not blow away the user's in-progress draft.
  useEffect(() => {
    if (doc.status.kind !== "ready") return;
    if (draftRef.current != null) return;
    draftRef.current = doc.status.content;
    lastSavedRef.current = doc.status.content;
    setCharCount(doc.status.content.length);
    // Decide override-vs-built-in structure from the seed content, once.
    setHasOverride(doc.status.content !== "");
  }, [doc.status]);

  // Null the draft markers on transition to error. Without this, a recovery
  // (error → ready) leaves the refs pointed at the pre-error value because
  // the seed-on-first-ready effect above bails when draftRef is set; a
  // subsequent beforeunload would then flush the stale value over the
  // server's recovered content.
  useEffect(() => {
    if (doc.status.kind !== "error") return;
    draftRef.current = null;
    lastSavedRef.current = null;
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(0);
  }, [doc.status]);

  // Surface an "external update" banner when an AI/device write changes
  // status.content out from under the uncontrolled editor AND the user has
  // no in-progress diff (draftRef === lastSavedRef). Clean-draft is the
  // safe case — reloading discards nothing the user typed.
  useEffect(() => {
    if (doc.status.kind !== "ready") return;
    if (lastSavedRef.current == null) return;
    const serverContent = doc.status.content;

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
  }, [doc.status]);

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
    const current = docRef.current;

    if (value == null) return;
    if (current.status.kind !== "ready") return;
    if (value === lastSavedRef.current) return;

    // A Clear or Import is on the wire. The editor stays live through its round
    // trip, so this draft is about to be thrown away by the remount that
    // follows — and ordering behind the replace only guarantees it lands LAST,
    // writing text to disk the editor no longer shows and no banner reports.
    // Dropping it matches what the user ends up looking at.
    if (replacingRef.current > 0) return;

    // Mark optimistically so a concurrent flush (debounce + blur) doesn't
    // dispatch the same content twice. On failure, roll the marker back so the
    // next flush (blur, beforeunload, or further edit) retries — unless the
    // user has since typed something newer. Also schedule an unattended retry
    // so a transient failure doesn't lose edits when the user has walked away.
    lastSavedRef.current = value;
    // Order this save behind the writes already on the wire — the same
    // guarantee dispatchOrderedWrite gives Clear/Import, in the other
    // direction. Typing during an in-flight Clear (the editor stays live until
    // clear's echo remounts it) would otherwise put two PUTs on the wire at
    // once; if the server handled this one first, the clear would land last and
    // strip the draft from disk while the editor still showed it saved, until a
    // poll surfaced the emptiness as an "updated outside the editor" banner.
    //
    // Only the DISPATCH defers — registration below stays synchronous, so a
    // Clear fired right after this flush is still ordered behind it — and
    // pendingSaves' null fast path keeps the idle case dispatching in this very
    // turn, which the beforeunload flush depends on (the transport can't use
    // `keepalive`). The trade: on beforeunload with a write already pending,
    // this flush now waits for a turn the closing page won't grant, so it drops
    // instead of racing. Both are best-effort there, and racing had its own
    // coin-flip chance of persisting the wrong content.
    const pending = pendingSaves(inFlightSavesRef.current);
    // Track the in-flight save so handleClear can await it before dispatching
    // clear (orders the writes on the wire — clear already accepts the
    // round-trip latency). Tracked as a promise that SETTLES rather than the
    // raw one: a rejection would otherwise leave the entry in the set forever
    // and wedge every later clear/import on a rejecting Promise.all. save()
    // resolves false rather than throwing today — this keeps that from being
    // load-bearing, and routes an unexpected throw into the retry path below.
    const savePromise = (
      pending == null
        ? current.save(value)
        : pending.then(() => current.save(value))
    ).catch(() => false);

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
    docRef.current = doc;
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

  // Bundled once so the module-level replaceDocument can reach the markers;
  // every field is a stable ref or a useState setter.
  const replaceCtxRef = useRef<ReplaceContext>({
    draftRef,
    lastSavedRef,
    debounceTimerRef,
    retryTimerRef,
    replacingRef,
    saves: inFlightSavesRef.current,
    setCharCount,
    setDirty,
    setEditorKey,
  });

  const handleClear = useCallback(async (): Promise<boolean> => {
    if (doc.status.kind !== "ready") return false;

    if (!window.confirm(clearConfirmMessage)) {
      return false;
    }

    setExternalUpdate(false);

    const ok = await replaceDocument(replaceCtxRef.current, "", () =>
      doc.clear(),
    );

    // The override is gone — revert to the built-in "Customize" view.
    if (ok) setHasOverride(false);

    return ok;
  }, [doc, clearConfirmMessage]);

  const handleReload = useCallback((): void => {
    if (doc.status.kind !== "ready") return;
    // Adopt the server's content as the new baseline and remount the editor.
    // Only offered when no in-progress diff exists, so this discards nothing
    // the user typed.
    draftRef.current = doc.status.content;
    lastSavedRef.current = doc.status.content;
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(doc.status.content.length);
    // Re-decide structure from the adopted server content (an external clear
    // reverts to the built-in view; adopted content keeps the editable pane).
    setHasOverride(doc.status.content !== "");
    clearTimer(debounceTimerRef);
    clearTimer(retryTimerRef);
    setEditorKey((k) => k + 1);
  }, [doc.status]);

  const handleImport = useCallback(
    async (content: string): Promise<void> => {
      if (doc.status.kind !== "ready") return;

      // Guard against clobbering in-progress work. An empty editor imports
      // silently (the common "start from a file" case).
      const current = draftRef.current ?? "";

      if (current.trim() !== "" && !window.confirm(IMPORT_CONFIRM)) return;

      setExternalUpdate(false);

      const ok = await replaceDocument(replaceCtxRef.current, content, () =>
        doc.save(content),
      );

      // Imported/forked content means the slot now overrides the built-in.
      if (ok) setHasOverride(true);
    },
    [doc],
  );

  const beginOverride = useCallback((): void => {
    setHasOverride(true);
  }, []);

  const getContent = useCallback((): string => draftRef.current ?? "", []);

  const dispatchWrite = useCallback(
    (write: () => Promise<boolean>): Promise<boolean> =>
      dispatchOrderedWrite(inFlightSavesRef.current, write),
    [],
  );

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
    beginOverride,
    getContent,
    dispatchWrite,
    charCount,
  };
}
