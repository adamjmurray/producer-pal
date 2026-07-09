// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";
import {
  runGuardedRefresh,
  type SaveStatus,
  useRefreshOnFocusAndPoll,
  useSaveRefreshGuard,
} from "./use-doc-memory";

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
  /** Delete one entry. Resolves true on success, false on failure. */
  deleteEntry: (name: string) => Promise<boolean>;
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
export function useDocCollection<TView extends DocCollectionEntry, TInput>(
  config: DocCollectionConfig,
): UseDocCollectionReturn<TView, TInput> {
  const { label, collectionUrl, entryUrl } = config;
  const [status, setStatus] = useState<DocCollectionStatus<TView>>({
    kind: "loading",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { beginSave, endSave, guardRefresh } = useSaveRefreshGuard();

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
    async (
      name: string,
      input: TInput,
      createOnly = false,
    ): Promise<TView | null> => {
      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const entry = await putEntry<TView, TInput>(
          entryUrl(name),
          input,
          createOnly,
          label,
        );

        setStatus((prev) => mergeEntry(prev, entry));
        setSaveStatus("saved");

        return entry;
      } catch (error: unknown) {
        setSaveError(errorMessage(error));
        setSaveStatus("error");

        return null;
      } finally {
        endSave();
      }
    },
    [beginSave, endSave, entryUrl, label],
  );

  const deleteEntry = useCallback(
    async (name: string): Promise<boolean> => {
      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        await deleteEntryRequest(entryUrl(name), label);

        setStatus((prev) => removeEntry(prev, name));
        setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        setSaveError(errorMessage(error));
        setSaveStatus("error");

        return false;
      } finally {
        endSave();
      }
    },
    [beginSave, endSave, entryUrl, label],
  );

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRefreshOnFocusAndPoll(refresh);

  return { status, saveStatus, saveError, saveEntry, deleteEntry, refresh };
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
   * editor mid-type (dropping focus); a new entry still persists on close via
   * the unmount flush.
   */
  autosaveOnIdle: boolean;
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
}

/**
 * Autosave lifecycle for a collection entry editor (memory, custom skills): a
 * debounced idle save for existing entries plus a flush on unmount and on tab
 * close, so a draft is never lost when the overlay closes, the tab switches, or
 * the selected entry changes. Modeled on the document editors'
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
  const canSaveRef = useRef(canSave);
  const draftKeyRef = useRef(draftKey);
  const persistRef = useRef(persist);
  const externalKeyRef = useRef(externalKey);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const seededRef = useRef(false);
  const [externalUpdate, setExternalUpdate] = useState(false);

  // Keep refs current so the flush/adopt callbacks (stable identity) see the
  // latest draft/persist/externalKey. Synced in an effect (not during render)
  // so we never write a ref while rendering; these callbacks only ever run
  // later (timer, event, unmount, click).
  useEffect(() => {
    canSaveRef.current = canSave;
    draftKeyRef.current = draftKey;
    persistRef.current = persist;
    externalKeyRef.current = externalKey;
  });

  const flush = useCallback((): void => {
    clearTimer(timerRef);

    if (!canSaveRef.current) return;

    const key = draftKeyRef.current;

    if (key === lastSavedRef.current) return;

    // Mark optimistically so overlapping flushes don't double-dispatch; roll
    // the marker back on failure (or adopt the echo on success) so the next
    // change or close retries/reconciles — unless a newer flush already moved
    // the marker past this one (the `lastSavedRef.current === key` guard).
    const previous = lastSavedRef.current;

    lastSavedRef.current = key;
    void persistRef.current().then((echoKey) => {
      if (!mountedRef.current || lastSavedRef.current !== key) return;

      lastSavedRef.current = echoKey ?? previous;
    });
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

      return;
    }

    if (!autosaveOnIdle || !canSave || draftKey === lastSavedRef.current) {
      return;
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

  // Flush on tab close so a pending draft isn't dropped.
  useEffect(() => {
    const onBeforeUnload = (): void => flush();

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [flush]);

  // Flush on unmount: overlay close, tab switch, and entry-selection change all
  // unmount this editor, and the draft must persist first.
  useEffect(
    () => () => {
      mountedRef.current = false;
      flush();
    },
    [flush],
  );

  const noteSaved = useCallback((echoKey: string): void => {
    lastSavedRef.current = echoKey;
  }, []);

  const adoptExternal = useCallback((): void => {
    lastSavedRef.current = externalKeyRef.current ?? null;
    setExternalUpdate(false);
  }, []);

  return { noteSaved, externalUpdate, adoptExternal };
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
 * GET the full collection.
 * @param url - The collection list endpoint
 * @param label - Error-message label (e.g. "Memory")
 * @returns Every stored entry
 */
async function fetchEntries<TView>(
  url: string,
  label: string,
): Promise<TView[]> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `${label} request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as { entries?: TView[] };

  return body.entries ?? [];
}

/**
 * PUT one entry.
 * @param url - The per-entry endpoint
 * @param input - The save payload
 * @param createOnly - When true, the server rejects (409) a name collision
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the stored entry
 */
async function putEntry<TView, TInput>(
  url: string,
  input: TInput,
  createOnly: boolean,
  label: string,
): Promise<TView> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createOnly ? { ...input, createOnly } : input),
  });

  if (!response.ok) {
    throw new Error(await writeErrorMessage(response, label));
  }

  const body = (await response.json()) as { entry: TView };

  return body.entry;
}

/**
 * DELETE one entry.
 * @param url - The per-entry endpoint
 * @param label - Error-message label (e.g. "Memory")
 */
async function deleteEntryRequest(url: string, label: string): Promise<void> {
  const response = await fetch(url, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await writeErrorMessage(response, label));
  }
}

/**
 * Build a save/delete error message, preferring the server's JSON `error` field
 * (e.g. the store's "body must not be empty") over a bare status line.
 * @param response - The failed fetch response
 * @param label - Error-message label (e.g. "Memory")
 * @returns A human-readable error message
 */
async function writeErrorMessage(
  response: Response,
  label: string,
): Promise<string> {
  const fallback = `${label} update failed (${response.status} ${response.statusText})`;

  try {
    const body = (await response.json()) as { error?: string };

    return body.error ?? fallback;
  } catch {
    return fallback;
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
