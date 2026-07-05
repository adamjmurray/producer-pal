// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";
import {
  runGuardedRefresh,
  type SaveStatus,
  useRefreshOnFocusAndPoll,
  useSaveRefreshGuard,
} from "./use-doc-memory";

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

// --- Helpers below main export ---

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
