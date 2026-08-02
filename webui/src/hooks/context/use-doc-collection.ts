// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import {
  deleteEntryRequest,
  fetchEntries,
  putEntry,
  putRename,
} from "#webui/utils/collection-transport";
import {
  runGuardedRefresh,
  useCollectionMutator,
  type SaveStatus,
  useRefreshOnFocusAndPoll,
} from "./use-doc";

const AUTOSAVE_DEBOUNCE_MS = 800;

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

/**
 * Read/write one ~/.producer-pal collection (a dynamic set of markdown entries
 * with a derived index) over its REST endpoints, generic over the entry view
 * (`TView`) and save input (`TInput`) shapes. Memory and custom skills are the
 * two instances: identical list/save/delete + save-overlap coordination, only
 * the entry fields, endpoints, and error label differ. The list GET returns
 * every entry; a PUT echoes the saved entry (merged into the cached list); a
 * DELETE removes one. Focus + interval polling surfaces external writes (the
 * assistant's own edits, or a hand-edit), and a save-overlap guard keeps a slow
 * poll from clobbering a concurrent save's echo.
 */

/** Minimum shape a collection entry view must expose (the stable handle). */
export interface DocCollectionEntry {
  /** Slug (filename without extension); the stable handle for save/delete. */
  name: string;
}

/** Status of a whole doc collection. */
export type DocCollectionStatus<TView> =
  | { kind: "loading" }
  | { kind: "ready"; entries: TView[] }
  | { kind: "error"; message: string };

export interface UseDocCollectionReturn<TView, TInput> {
  status: DocCollectionStatus<TView>;
  saveStatus: SaveStatus;
  saveError: string | null;
  /**
   * Create or overwrite one entry. Pass `createOnly` from the create flow so a
   * name that collides with an existing slug is rejected (409) instead of
   * silently overwriting. Resolves the stored entry, or null on failure.
   */
  saveEntry: (
    name: string,
    input: TInput,
    createOnly?: boolean,
  ) => Promise<TView | null>;
  /**
   * Rename one entry: persist its current fields under `newName` and drop the
   * old slug. Resolves the stored entry, or null on failure (e.g. a name
   * collision, surfaced via saveError). A no-op slug change updates in place.
   */
  renameEntry: (
    oldName: string,
    newName: string,
    input: TInput,
  ) => Promise<TView | null>;
  /** Delete one entry. Resolves true on success, false on failure. */
  deleteEntry: (name: string) => Promise<boolean>;
  /**
   * Reset the save status to idle (clearing any "saved"/error). Called when the
   * edited entry changes so a header indicator doesn't carry the prior entry's
   * outcome onto the next one (or onto the create form). Also advances a
   * generation token so a save that was still in flight for the prior entry
   * (its unmount-flush, or a debounce that already fired) can't paint its late
   * "saved"/"error" onto the newly-selected entry.
   */
  resetSaveStatus: () => void;
  /** Re-read all entries from the server. */
  refresh: () => Promise<void>;
}

/** Per-collection configuration: endpoints and the error-message label. */
export interface DocCollectionConfig {
  /** Human label used in error messages (e.g. "Memory", "Custom skill"). */
  label: string;
  /** The collection list endpoint URL (GET). */
  collectionUrl: () => string;
  /** The per-entry endpoint URL (PUT/DELETE). */
  entryUrl: (name: string) => string;
}

/**
 * The generic collection hook backing {@link import("./use-memory-collection")}
 * and the custom-skills manager. See the module comment.
 *
 * @param config - The collection's endpoints and error label
 * @returns Collection state plus save/delete and refresh actions
 */
export function useDocCollection<
  TView extends DocCollectionEntry,
  TInput extends object,
>(config: DocCollectionConfig): UseDocCollectionReturn<TView, TInput> {
  const { label, collectionUrl, entryUrl } = config;
  const [status, setStatus] = useState<DocCollectionStatus<TView>>({
    kind: "loading",
  });
  // saveEntry/renameEntry return the entry (or null) straight from `mutate`;
  // deleteEntry maps its void result to a boolean.
  const { saveStatus, saveError, resetSaveStatus, guardRefresh, mutate } =
    useCollectionMutator();

  const refresh = useCallback(
    (): Promise<void> =>
      runGuardedRefresh(
        guardRefresh,
        () => fetchEntries<TView>(collectionUrl(), label),
        (entries) => setStatus({ kind: "ready", entries }),
        (message) => setStatus({ kind: "error", message }),
      ),
    [guardRefresh, collectionUrl, label],
  );

  const saveEntry = useCallback(
    (name: string, input: TInput, createOnly = false): Promise<TView | null> =>
      mutate(
        () => putEntry<TView>(entryUrl(name), input, createOnly, label),
        (entry) => setStatus((prev) => mergeEntry(prev, entry)),
        [name],
      ),
    [mutate, entryUrl, label],
  );

  const renameEntry = useCallback(
    (oldName: string, newName: string, input: TInput): Promise<TView | null> =>
      mutate(
        () =>
          putRename<TView>(
            `${entryUrl(oldName)}/rename`,
            newName,
            input,
            label,
          ),
        // Drop the old slug and merge the new entry (a no-op slug change just
        // re-adds it; the list re-sorts by name, so order is irrelevant).
        (entry) =>
          setStatus((prev) => mergeEntry(removeEntry(prev, oldName), entry)),
        // A rename touches both slugs, so a later write to EITHER supersedes it.
        [oldName, newName],
      ),
    [mutate, entryUrl, label],
  );

  const deleteEntry = useCallback(
    async (name: string): Promise<boolean> => {
      // deleteEntryRequest resolves void, so mutate returns undefined on success
      // and null on failure — the null check is the success signal.
      const result = await mutate(
        () => deleteEntryRequest(entryUrl(name), label),
        () => setStatus((prev) => removeEntry(prev, name)),
        [name],
      );

      return result !== null;
    },
    [mutate, entryUrl, label],
  );

  useRefreshOnFocusAndPoll(refresh);

  return {
    status,
    saveStatus,
    saveError,
    saveEntry,
    renameEntry,
    deleteEntry,
    resetSaveStatus,
    refresh,
  };
}

/** Params for {@link useCollectionEntryAutosave}. */
export interface CollectionEntryAutosaveParams {
  /**
   * Whether the current draft is valid to persist (name + body present and no
   * save in flight). A non-savable draft is never flushed.
   */
  canSave: boolean;
  /**
   * A serialization of the draft; any change from the last persisted value marks
   * it dirty. (e.g. `JSON.stringify([name, type, description, body])`.)
   */
  draftKey: string;
  /**
   * Whether to persist on idle (debounced). True for existing entries — a save
   * doesn't change identity there, so nothing remounts. False for a new entry,
   * whose first persist flips it to an existing entry and would remount the
   * editor mid-type (dropping focus).
   */
  autosaveOnIdle: boolean;
  /**
   * Whether to flush the draft on unmount and on tab close (defaults true). True
   * for existing entries — an in-flight edit must survive a navigation/close.
   * False for a NEW draft, which is created ONLY by the explicit Create button,
   * never silently on navigate-away; a nav guard confirms the discard instead
   * (see {@link import("#webui/components/context/collection/leave-guard")}).
   */
  flushOnLeave?: boolean;
  /**
   * Persist the current draft — saveEntry ONLY, no navigation (`onSaved`), which
   * would fight the user's selection when this fires on unmount. Resolves the
   * server's echo, serialized in the SAME shape as `draftKey`/`externalKey`
   * (e.g. `JSON.stringify([saved.name, saved.description, saved.body])`), on
   * success, or null on failure so a failed save is retried on the next change
   * or close. The echo (not the sent draft) becomes the new baseline: the
   * server may normalize fields (slugified name, trimmed body,
   * whitespace-collapsed description), so seeding the baseline from what was
   * SENT would make the very next external-update comparison mistake our own
   * echo for a foreign write.
   */
  persist: () => Promise<string | null>;
  /**
   * Serialization of the live entry prop's persisted fields, in the SAME shape
   * as `draftKey` (e.g. `JSON.stringify([entry.name, entry.description,
   * entry.body])`). Omitted in new-entry mode (`entry == null`) — there is no
   * baseline yet to diverge from, so external-update detection stays off.
   */
  externalKey?: string;
}

/** The return of {@link useCollectionEntryAutosave}. */
export interface CollectionEntryAutosaveReturn {
  /**
   * Advance the baseline to the save's echo (see `persist`'s doc) after an
   * explicit manual save, so the unmount flush doesn't redundantly re-persist
   * the same content and the next external-update comparison sees our own
   * echo as in sync rather than a foreign write.
   * @param echoKey - The saved entry's key, in the SAME shape as `draftKey`
   */
  noteSaved: (echoKey: string) => void;
  /**
   * True when the live entry prop has diverged from the baseline (the
   * assistant's own context tool, or another tab, wrote to this entry while it
   * was open) AND the draft is clean (`draftKey` === baseline). A dirty draft
   * suppresses this — typing is an implicit last-write-wins choice, and the
   * debounced autosave would clobber the external change within
   * `AUTOSAVE_DEBOUNCE_MS` anyway, so there is nothing more to solve there.
   * Always false in new-entry mode (no `externalKey`).
   */
  externalUpdate: boolean;
  /**
   * Adopt the live entry prop as the new baseline (the Reload button). Reads
   * the current `externalKey` off a ref rather than a fresh closure: a caller
   * that also re-seeds its local field state via `setState` in the same click
   * handler hasn't run the ref-sync effect for THIS render yet (effects run
   * after render, once), so a value read through `draftKeyRef` at that point
   * would still be the PRE-reload draft. `externalKey` isn't affected by the
   * caller's own re-seed (it derives from the `entry` prop, not local state),
   * so reading it off the same ref is safe here.
   */
  adoptExternal: () => void;
  /**
   * Settle the idle autosave before a write that MOVES this entry (a rename):
   * cancel the armed debounce, and resolve once any already-dispatched save has
   * landed. Both target the entry's CURRENT slug, so a rename issued on top of
   * one leaves two writes racing for the same file — and if the rename lands
   * first, the save re-creates the entry it just moved away from (a duplicate
   * under the old name). Cancelling loses nothing: the rename carries the same
   * live draft to the new slug.
   */
  settlePendingSave: () => Promise<void>;
}

/**
 * Autosave lifecycle for a collection entry editor (memory, custom skills): a
 * debounced idle save for existing entries plus a flush on unmount and on tab
 * close, so a draft is never lost when the overlay closes, the tab switches, or
 * the selected entry changes. Exception: once the edited entry is deleted
 * externally (`externalKey` goes from defined to undefined), flushes are
 * suppressed — only the explicit Save button may re-create a deleted entry
 * from the kept draft. Modeled on the document editors'
 * `useContextEditorState` flush logic, including its external-update detection:
 * one shared baseline (`lastSavedRef`) drives both the dirty check (autosave
 * arming) and the external-update banner, exactly as `useContextEditorState`
 * does with its own `lastSavedRef`. The explicit Save button owns navigation
 * (new→edit) and calls {@link CollectionEntryAutosaveReturn.noteSaved} to keep
 * this baseline in sync so the unmount flush doesn't redundantly re-save.
 *
 * @param params - Draft state + the persist thunk
 * @returns The manual-save sync handle plus external-update state/adoption
 */
export function useCollectionEntryAutosave(
  params: CollectionEntryAutosaveParams,
): CollectionEntryAutosaveReturn {
  const { canSave, draftKey, autosaveOnIdle, persist, externalKey } = params;
  // Constant per mount (isNew is fixed per editor key), so the leave effects can
  // gate on it directly without a ref.
  const flushOnLeave = params.flushOnLeave ?? true;
  const canSaveRef = useRef(canSave);
  const draftKeyRef = useRef(draftKey);
  const persistRef = useRef(persist);
  const externalKeyRef = useRef(externalKey);
  const hadExternalKeyRef = useRef(externalKey != null);
  const deletedExternallyRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tail of the save chain: the last flush registered, so the next one queues
  // behind it (see flush) and a rename can wait the whole chain out (see
  // settlePendingSave). Null whenever no save is outstanding.
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const seededRef = useRef(false);
  const [externalUpdate, setExternalUpdate] = useState(false);

  // Keep refs current so the flush/adopt callbacks (stable identity) see the
  // latest draft/persist/externalKey. Synced in an effect (never during render);
  // these callbacks only ever run later (timer, event, unmount, click). None of
  // these gate the resurrect-on-unmount decision, so deferred timing is fine.
  useEffect(() => {
    canSaveRef.current = canSave;
    draftKeyRef.current = draftKey;
    persistRef.current = persist;
    externalKeyRef.current = externalKey;
  });

  // Deletion detection is synced in a LAYOUT effect — it runs synchronously at
  // commit, before the next microtask can re-render/unmount this editor. When
  // the edited entry is deleted out from under the editor, its `externalKey`
  // goes undefined and the editor unmounts (a switch to the create form) in the
  // very next microtask; a plain (deferred) effect would NOT have run by then,
  // leaving a stale `deletedExternallyRef` that lets the unmount flush RESURRECT
  // the just-deleted entry from the kept draft. A genuinely-new entry never
  // latches the flag, so it stays false here.
  useLayoutEffect(() => {
    if (externalKey != null) hadExternalKeyRef.current = true;
    deletedExternallyRef.current =
      hadExternalKeyRef.current && externalKey == null;
  });

  const flush = useCallback((): void => {
    clearTimer(timerRef);

    // An entry deleted out from under the editor must never be re-created by
    // an implicit flush: Discard's unmount would resurrect the entry it just
    // dropped, and closing the overlay/tab would silently undo the deletion.
    // Re-creating from the kept draft is the explicit Save button's job (see
    // CollectionScreen's deleted-externally banner).
    if (deletedExternallyRef.current) return;

    if (!canSaveRef.current) return;

    const key = draftKeyRef.current;

    if (key === lastSavedRef.current) return;

    // Mark optimistically so overlapping flushes don't double-dispatch; roll
    // the marker back on failure (or adopt the echo on success) so the next
    // change or close retries/reconciles — unless a newer flush already moved
    // the marker past this one (the `lastSavedRef.current === key` guard).
    const previous = lastSavedRef.current;

    lastSavedRef.current = key;

    // Send the current draft — unless the entry was deleted while this flush was
    // waiting its turn behind an earlier one. Re-creating it from the kept draft
    // is the explicit Save button's job alone (same reason as the guard above),
    // so the deferred dispatch has to re-check rather than trust the decision
    // made when it was queued. Resolving null takes the failure path below,
    // rolling the baseline back so the draft still reads as unsaved.
    const dispatch = (): Promise<string | null> =>
      deletedExternallyRef.current
        ? Promise.resolve(null)
        : persistRef.current();
    // Chain behind whatever is already on the wire instead of racing it. An entry
    // PUT carries the WHOLE body, so two overlapping writes are not a field-level
    // overlap: whichever the server happens to handle last owns the file
    // outright, and a slow first PUT landing second reverts content the UI is
    // already showing (use-doc's generation counter keeps the SCREEN correct, so
    // the disagreement stays silent until the next poll). The same-key guard
    // above stops a re-flush of unchanged content, not this — a CHANGED draft
    // dispatched mid-flight is exactly the 800ms-debounce-vs-slow-PUT case.
    //
    // Registration is synchronous, before any await, so a third flush arriving
    // inside this window chains behind THIS one rather than reading a
    // pre-registration inFlightRef and putting two writes on the wire anyway.
    // Only the DISPATCH defers — the same split as useContextEditorState's
    // dispatchOrderedWrite.
    const prior = inFlightRef.current;
    const pending: Promise<void> = (
      prior == null ? dispatch() : prior.then(dispatch)
    ).then((echoKey) => {
      if (inFlightRef.current === pending) inFlightRef.current = null;
      if (!mountedRef.current || lastSavedRef.current !== key) return;

      lastSavedRef.current = echoKey ?? previous;
    });

    inFlightRef.current = pending;
  }, []);

  // Seed the baseline once (an unedited existing entry must not re-save on
  // mount), then debounce an idle autosave on every later change — but only for
  // existing entries (see autosaveOnIdle). draftKey equals externalKey at this
  // first render for an existing entry (both derive from the same seed
  // fields), so this single baseline is already correct for the
  // external-update comparison below too — no separate external seed needed.
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      lastSavedRef.current = canSave ? draftKey : null;

      return undefined;
    }

    if (!autosaveOnIdle || !canSave || draftKey === lastSavedRef.current) {
      return undefined;
    }

    timerRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimer(timerRef);
  }, [canSave, draftKey, autosaveOnIdle, flush]);

  // Surface the external-update banner when the live entry prop diverges from
  // the baseline (an assistant write or another tab) AND the draft is clean.
  // A dirty draft (draftKey !== baseline) bails out, matching
  // useContextEditorState's identical guard: the user has already chosen to
  // keep editing. Always off in new-entry mode (externalKey undefined).
  useEffect(() => {
    if (externalKey == null) {
      setExternalUpdate(false);

      return;
    }

    if (externalKey === lastSavedRef.current) {
      setExternalUpdate(false);

      return;
    }

    setExternalUpdate(draftKey === lastSavedRef.current);
  }, [externalKey, draftKey]);

  // Flush on tab close so a pending draft isn't dropped — but only when
  // flushOnLeave (existing entries). A new draft is created explicitly (Create),
  // so its editor prompts a discard confirm on close instead of silently saving.
  useEffect(() => {
    if (!flushOnLeave) return undefined;

    const onBeforeUnload = (): void => flush();

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush, flushOnLeave]);

  // On unmount always mark unmounted (so the async flush callback can't setState
  // afterward), then flush the pending draft — overlay close, tab switch, and
  // entry-selection change all unmount this editor. A new draft skips the flush
  // (flushOnLeave false); its discard is confirmed by the nav guard instead.
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (flushOnLeave) flush();
    },
    [flush, flushOnLeave],
  );

  const noteSaved = useCallback((echoKey: string): void => {
    lastSavedRef.current = echoKey;
  }, []);

  const adoptExternal = useCallback((): void => {
    lastSavedRef.current = externalKeyRef.current ?? null;
    setExternalUpdate(false);
  }, []);

  // Cancel the armed debounce (the rename carries the same draft onward), then
  // wait out any save already dispatched — it can only be resolved by letting it
  // land, since the request is gone. Awaiting the chain's tail covers a queued
  // flush too: its PUT hasn't gone out yet, but it still targets the old slug.
  // See the interface doc for why.
  const settlePendingSave = useCallback(async (): Promise<void> => {
    clearTimer(timerRef);
    await inFlightRef.current;
  }, []);

  return { noteSaved, externalUpdate, adoptExternal, settlePendingSave };
}

// --- Helpers below main export ---

/**
 * Clear a setTimeout ref if armed, and null it out.
 * @param ref - The timer ref to clear
 */
function clearTimer(ref: TimerRef): void {
  if (ref.current != null) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

/**
 * Replace the matching entry in a ready status with the server's echo, or
 * append it when it is new. A non-ready status is returned unchanged (a save
 * can only follow a load).
 * @param prev - The previous collection status
 * @param updated - The server's echo of one entry
 * @returns The status with that entry merged in
 */
function mergeEntry<TView extends DocCollectionEntry>(
  prev: DocCollectionStatus<TView>,
  updated: TView,
): DocCollectionStatus<TView> {
  if (prev.kind !== "ready") return prev;

  const exists = prev.entries.some((entry) => entry.name === updated.name);
  const entries = exists
    ? prev.entries.map((entry) =>
        entry.name === updated.name ? updated : entry,
      )
    : [...prev.entries, updated];

  return { kind: "ready", entries };
}

/**
 * Remove the named entry from a ready status.
 * @param prev - The previous collection status
 * @param name - The entry to remove
 * @returns The status without that entry
 */
function removeEntry<TView extends DocCollectionEntry>(
  prev: DocCollectionStatus<TView>,
  name: string,
): DocCollectionStatus<TView> {
  if (prev.kind !== "ready") return prev;

  return {
    kind: "ready",
    entries: prev.entries.filter((entry) => entry.name !== name),
  };
}
