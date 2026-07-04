// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";
import {
  getMemoryCollectionUrl,
  getMemoryEntryUrl,
} from "#webui/utils/mcp-url";
import {
  type SaveStatus,
  useRefreshOnFocusAndPoll,
  useSaveRefreshGuard,
} from "./use-doc-memory";

/** One stored memory, as the manager needs it. */
export interface MemoryEntryView {
  /** Slug (filename without extension); the stable handle for save/delete. */
  name: string;
  /** Which bucket it belongs to (drives injection + list grouping). */
  type: string;
  /** One-line recall hook shown in the list. */
  description: string;
  /** The fact body (markdown). */
  body: string;
}

/** The fields a save writes (the slug comes from the entry name / URL). */
export interface MemoryEntryInput {
  type: string;
  description: string;
  content: string;
}

/** Status of the whole memory collection. */
export type MemoryCollectionStatus =
  | { kind: "loading" }
  | { kind: "ready"; entries: MemoryEntryView[] }
  | { kind: "error"; message: string };

export interface UseMemoryCollectionReturn {
  status: MemoryCollectionStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Create or overwrite one memory. Resolves the stored entry, or null on failure. */
  saveEntry: (
    name: string,
    input: MemoryEntryInput,
  ) => Promise<MemoryEntryView | null>;
  /** Delete one memory. Resolves true on success, false on failure. */
  deleteEntry: (name: string) => Promise<boolean>;
  /** Re-read all entries from the server. */
  refresh: () => Promise<void>;
}

/**
 * Read/write the LLM-managed memory collection (~/.producer-pal/memory/) as one
 * collection. The list GET returns every entry (name/type/description/body); a
 * PUT echoes the saved entry (merged into the cached list, replacing or
 * appending), and a DELETE removes one. Focus + interval polling surfaces
 * external writes (the assistant's own remember/forget), and a save-overlap
 * guard keeps a slow poll from clobbering a concurrent save's echo — the same
 * coordination the fixed-slot {@link useSkillOverrides} uses, but over a dynamic
 * set that grows and shrinks.
 *
 * @returns Collection state plus save/delete and refresh actions
 */
export function useMemoryCollection(): UseMemoryCollectionReturn {
  const [status, setStatus] = useState<MemoryCollectionStatus>({
    kind: "loading",
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { beginSave, endSave, guardRefresh } = useSaveRefreshGuard();

  const refresh = useCallback(async (): Promise<void> => {
    const supersededBySave = guardRefresh();

    try {
      const entries = await fetchEntries();

      if (supersededBySave()) return;

      setStatus({ kind: "ready", entries });
    } catch (error: unknown) {
      if (supersededBySave()) return;

      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, [guardRefresh]);

  const saveEntry = useCallback(
    async (
      name: string,
      input: MemoryEntryInput,
    ): Promise<MemoryEntryView | null> => {
      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const entry = await putEntry(name, input);

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
    [beginSave, endSave],
  );

  const deleteEntry = useCallback(
    async (name: string): Promise<boolean> => {
      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        await deleteEntryRequest(name);

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
    [beginSave, endSave],
  );

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRefreshOnFocusAndPoll(refresh);

  return { status, saveStatus, saveError, saveEntry, deleteEntry, refresh };
}

// --- Helpers below main export ---

/** Server shape for one memory entry in the /memory responses. */
interface RawMemoryEntry {
  name: string;
  type: string;
  description: string;
  body: string;
}

/**
 * GET the full memory collection.
 * @returns Every stored entry
 */
async function fetchEntries(): Promise<MemoryEntryView[]> {
  const response = await fetch(getMemoryCollectionUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Memory request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as { entries?: RawMemoryEntry[] };

  return (body.entries ?? []).map(toView);
}

/**
 * PUT one memory entry.
 * @param name - The desired name (slugified server-side)
 * @param input - The type/description/content payload
 * @returns The server's echo of the stored entry
 */
async function putEntry(
  name: string,
  input: MemoryEntryInput,
): Promise<MemoryEntryView> {
  const response = await fetch(getMemoryEntryUrl(name), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await writeErrorMessage(response));
  }

  const body = (await response.json()) as { entry: RawMemoryEntry };

  return toView(body.entry);
}

/**
 * DELETE one memory entry.
 * @param name - The entry name
 */
async function deleteEntryRequest(name: string): Promise<void> {
  const response = await fetch(getMemoryEntryUrl(name), { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await writeErrorMessage(response));
  }
}

/**
 * Build a save/delete error message, preferring the server's JSON `error` field
 * (e.g. the store's "body must not be empty") over a bare status line.
 * @param response - The failed fetch response
 * @returns A human-readable error message
 */
async function writeErrorMessage(response: Response): Promise<string> {
  const fallback = `Memory update failed (${response.status} ${response.statusText})`;

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
function mergeEntry(
  prev: MemoryCollectionStatus,
  updated: MemoryEntryView,
): MemoryCollectionStatus {
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
function removeEntry(
  prev: MemoryCollectionStatus,
  name: string,
): MemoryCollectionStatus {
  if (prev.kind !== "ready") return prev;

  return {
    kind: "ready",
    entries: prev.entries.filter((entry) => entry.name !== name),
  };
}

/**
 * Map a server entry record to the manager's view shape.
 * @param raw - The server entry record
 * @returns The manager view of that entry
 */
function toView(raw: RawMemoryEntry): MemoryEntryView {
  return {
    name: raw.name,
    type: raw.type,
    description: raw.description,
    body: raw.body,
  };
}
