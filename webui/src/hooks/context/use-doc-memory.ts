// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";

/** How often to re-read the document while the editor is open and focused. */
const POLL_INTERVAL_MS = 5000;

/** Status of a single markdown document's body. */
export type DocMemoryStatus =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "error"; message: string };

/** Save lifecycle state */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseDocMemoryReturn {
  status: DocMemoryStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Write content to the document. Resolves true on success, false on failure. */
  save: (content: string) => Promise<boolean>;
  /** Clear stored content. Same channel as save(""). */
  clear: () => Promise<boolean>;
  /** Re-read the document from the server (e.g. when the tab becomes visible). */
  refresh: () => Promise<void>;
}

/**
 * Read/write a single markdown document over an injected transport, with the
 * save/refresh coordination the editor needs: optimistic save status, focus +
 * interval polling for external writes, and a guard so a slow refresh GET can't
 * clobber a concurrent save's echo. `useContextMemory` (project context via
 * /config), `useGlobalContextMemory`, and `useSystemPromptMemory` are thin
 * wrappers that supply their own transport (see {@link makeContentTransport}).
 *
 * `read` and `write` MUST be stable references (module-level functions) — they
 * are effect/callback dependencies, so a fresh closure each render would
 * re-arm the poll and re-fetch on every render.
 *
 * @param read - Fetch current content from the server
 * @param write - Persist content; resolves to the stored content (echo)
 * @returns Document state plus save/clear/refresh actions
 */
export function useDocMemory(
  read: () => Promise<string>,
  write: (content: string) => Promise<string>,
): UseDocMemoryReturn {
  const [status, setStatus] = useState<DocMemoryStatus>({ kind: "loading" });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const { beginSave, endSave, guardRefresh } = useSaveRefreshGuard();

  const refresh = useCallback(async (): Promise<void> => {
    const discardRefresh = guardRefresh();

    try {
      const content = await read();

      if (discardRefresh()) return;

      setStatus({ kind: "ready", content });
    } catch (error: unknown) {
      if (discardRefresh()) return;

      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, [read, guardRefresh]);

  const save = useCallback(
    async (content: string): Promise<boolean> => {
      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const stored = await write(content);

        setStatus({ kind: "ready", content: stored });
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
    [write, beginSave, endSave],
  );

  const clear = useCallback((): Promise<boolean> => save(""), [save]);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRefreshOnFocusAndPoll(refresh);

  return {
    status,
    saveStatus,
    saveError,
    save,
    clear,
    refresh,
  };
}

// --- Shared save/refresh coordination (also used by useSkillOverrides) ---

/** Save/refresh race coordination primitives (see {@link useSaveRefreshGuard}). */
export interface SaveRefreshGuard {
  /** Mark a save started (before its write begins). */
  beginSave: () => void;
  /** Mark a save finished (in the write's finally). */
  endSave: () => void;
  /** Snapshot the guard at a refresh's start; the returned predicate reports
   *  whether the refresh's result should be DISCARDED — because a save overlapped
   *  its round-trip (the save's echo should win) or the component unmounted while
   *  it was in flight (nothing left to update). */
  guardRefresh: () => () => boolean;
}

/**
 * Coordinate refresh() reads against in-flight save() writes, shared by the
 * single-document ({@link useDocMemory}) and slot-collection (useSkillOverrides)
 * memory hooks. A focus/poll read can resolve older data than a concurrent
 * save's echo and, landing last, clobber it. `beginSave`/`endSave` bracket each
 * write (an in-flight counter plus a monotonic generation counter); a refresh
 * calls `guardRefresh()` at its start and trusts its result only if no save
 * overlapped the round-trip. The same predicate also reports true once the
 * component has unmounted, so a late-resolving fetch can't setState on a dead
 * component (matching the AbortController guard the preview/config hooks use).
 * @returns The save-bracketing and refresh-guard helpers
 */
export function useSaveRefreshGuard(): SaveRefreshGuard {
  const saveCountRef = useRef(0);
  const saveGenRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const beginSave = useCallback((): void => {
    saveCountRef.current++;
    saveGenRef.current++;
  }, []);

  const endSave = useCallback((): void => {
    saveCountRef.current--;
  }, []);

  const guardRefresh = useCallback((): (() => boolean) => {
    const inFlightAtStart = saveCountRef.current;
    const genAtStart = saveGenRef.current;

    return (): boolean =>
      !mountedRef.current ||
      inFlightAtStart > 0 ||
      saveGenRef.current !== genAtStart;
  }, []);

  return { beginSave, endSave, guardRefresh };
}

/**
 * Refresh on window focus and on a focus-gated interval so external writes
 * (device/AI/hand edits made while the tab was elsewhere) surface within a few
 * seconds without a manual reload. Polling is gated on `document.hasFocus()` to
 * avoid idle background traffic; the focus listener fires unconditionally on
 * return. The refresh must defer to in-flight saves (see
 * {@link useSaveRefreshGuard}) so a tick mid-save can't clobber the echo.
 * @param refresh - Stable refresh callback to run on focus and each poll tick
 */
export function useRefreshOnFocusAndPoll(
  refresh: () => void | Promise<void>,
): void {
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    window.addEventListener("focus", handleFocus);
    const id = setInterval(() => {
      if (document.hasFocus()) void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(id);
    };
  }, [refresh]);
}

// --- Content transport factory (single-content markdown endpoints) ---

/** Server shape for the single-content markdown doc endpoints. */
interface ContentResponse {
  content?: string;
}

/** A stable read/write transport pair for {@link useDocMemory}. */
export interface ContentTransport {
  read: () => Promise<string>;
  write: (content: string) => Promise<string>;
}

/**
 * Build a read/write transport for a single-content markdown endpoint that
 * speaks GET(no-store)→{content} and PUT(JSON {content})→{content}. The system
 * prompt and global context endpoints are byte-identical but for their URL and
 * error label, so they share this factory. Call it once at module scope so the
 * pair is a stable reference (see {@link useDocMemory}).
 * @param url - The endpoint URL
 * @param label - Human label for error copy (e.g. "System prompt")
 * @returns The stable { read, write } transport pair
 */
export function makeContentTransport(
  url: string,
  label: string,
): ContentTransport {
  const read = async (): Promise<string> => {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        `${label} request failed (${response.status} ${response.statusText})`,
      );
    }

    const body = (await response.json()) as ContentResponse;

    return body.content ?? "";
  };

  const write = async (content: string): Promise<string> => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(
        `${label} update failed (${response.status} ${response.statusText})`,
      );
    }

    const body = (await response.json()) as ContentResponse;

    return body.content ?? "";
  };

  return { read, write };
}
