// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// REST transport for the ~/.producer-pal doc collections (memory, custom
// skills): the list GET, per-entry PUT/rename/DELETE, and the shared write-error
// formatter. Generic over the entry view (`TView`) shape, with no dependency on
// the collection hook's state types, so it lives beside the other fetch
// utilities rather than inside the hook module (see
// #webui/hooks/context/use-doc-collection).

import { COLLECTION_WRITE_TIMEOUT_MS } from "#webui/lib/constants/transport";

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
//
// They also carry a deadline (see writeRequest). A caller can't tell a hung
// write from a slow one, so it keeps waiting: the memory editor holds autosave
// off across a rename until the write settles, and one that never settles would
// silently kill autosave for the rest of the editor's mount.

/**
 * PUT one entry.
 * @param url - The per-entry endpoint
 * @param input - The save payload
 * @param createOnly - When true, the server rejects (409) a name collision
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the stored entry
 */
export async function putEntry<TView>(
  url: string,
  input: object,
  createOnly: boolean,
  label: string,
): Promise<TView> {
  return await putJson<TView>(
    url,
    createOnly ? { ...input, createOnly } : input,
    label,
  );
}

/**
 * PUT one entry rename (its current fields under a new name).
 * @param url - The per-entry rename endpoint (`.../:oldName/rename`)
 * @param newName - The requested new name (slugified server-side)
 * @param input - The entry's current fields to carry over
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the renamed entry
 */
export async function putRename<TView>(
  url: string,
  newName: string,
  input: object,
  label: string,
): Promise<TView> {
  return await putJson<TView>(url, { ...input, newName }, label);
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
  await writeRequest(url, { method: "DELETE" }, label, () => Promise.resolve());
}

/**
 * PUT a JSON body to an entry endpoint and unwrap the server's `{ entry }` echo.
 * @param url - The endpoint to write to
 * @param body - The payload to serialize
 * @param label - Error-message label (e.g. "Memory")
 * @returns The server's echo of the stored entry
 */
async function putJson<TView>(
  url: string,
  body: unknown,
  label: string,
): Promise<TView> {
  return await writeRequest(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    label,
    async (response) => ((await response.json()) as { entry: TView }).entry,
  );
}

/**
 * Send one write and fail it if the server doesn't answer in time. The deadline
 * covers the body read too, since a response whose stream stalls hangs the
 * caller exactly the way an unanswered request does.
 * @param url - The endpoint to write to
 * @param init - Method, headers, and body for the request
 * @param label - Error-message label (e.g. "Memory")
 * @param readBody - Reads the successful response
 * @returns Whatever readBody read
 */
async function writeRequest<T>(
  url: string,
  init: RequestInit,
  label: string,
  readBody: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  // Nothing fires it once the page is gone, so a keepalive write dispatched from
  // the beforeunload/unmount flush still finishes on its own.
  const timer = setTimeout(
    controller.abort.bind(controller),
    COLLECTION_WRITE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      ...init,
      keepalive: true,
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(await writeErrorMessage(response, label));

    return await readBody(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${label} update timed out`, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timer);
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
