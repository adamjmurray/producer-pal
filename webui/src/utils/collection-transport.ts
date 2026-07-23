// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST transport for the ~/.producer-pal doc collections (memory, custom
// skills): the list GET, per-entry PUT/rename/DELETE, and the shared write-error
// formatter. Generic over the entry view (`TView`) and save input (`TInput`)
// shapes, with no dependency on the collection hook's state types, so it lives
// beside the other fetch utilities rather than inside the hook module (see
// #webui/hooks/context/use-doc-collection).

/**
 * GET the full collection.
 * @param url - The collection list endpoint
 * @param label - Error-message label (e.g. "Memory")
 * @returns Every stored entry
 */
export async function fetchEntries<TView>(
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

// The mutating writes below set `keepalive: true` so a save/delete dispatched
// from the editor's beforeunload/unmount flush can finish after the page starts
// tearing down — a fast tab-close otherwise aborts the in-flight request and
// drops the last autosave. Collection entries (memory facts, skill fragments)
// are small, so the browser's ~64KB keepalive body quota is never a concern
// here — unlike the single-doc context/system-prompt writes (see
// #webui/hooks/context/use-doc `makeContentTransport`), whose imported
// bodies can far exceed it, so those deliberately stay a plain fetch.

/**
 * PUT one entry.
 * @param url - The per-entry endpoint
 * @param input - The save payload
 * @param createOnly - When true, the server rejects (409) a name collision
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the stored entry
 */
export async function putEntry<TView, TInput>(
  url: string,
  input: TInput,
  createOnly: boolean,
  label: string,
): Promise<TView> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createOnly ? { ...input, createOnly } : input),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(await writeErrorMessage(response, label));
  }

  const body = (await response.json()) as { entry: TView };

  return body.entry;
}

/**
 * PUT one entry rename (its current fields under a new name).
 * @param url - The per-entry rename endpoint (`.../:oldName/rename`)
 * @param newName - The requested new name (slugified server-side)
 * @param input - The entry's current fields to carry over
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the renamed entry
 */
export async function putRename<TView, TInput>(
  url: string,
  newName: string,
  input: TInput,
  label: string,
): Promise<TView> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, newName }),
    keepalive: true,
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
export async function deleteEntryRequest(
  url: string,
  label: string,
): Promise<void> {
  const response = await fetch(url, { method: "DELETE", keepalive: true });

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
export async function writeErrorMessage(
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
