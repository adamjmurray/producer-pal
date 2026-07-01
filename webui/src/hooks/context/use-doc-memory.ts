// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";

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
 * /config) and `useGlobalContextMemory` (global context via /global-context)
 * are thin wrappers that supply their own transport.
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
  // Coordinate refresh() reads against in-flight save() writes. A focus/poll
  // read can resolve older content than a concurrent save's write and, if it
  // lands last, clobber the save's echo. saveCountRef counts currently-running
  // saves; saveGenRef counts saves ever started. A refresh trusts its result
  // only if no save overlapped its round-trip.
  const saveCountRef = useRef(0);
  const saveGenRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const saveInFlightAtStart = saveCountRef.current;
    const saveGenAtStart = saveGenRef.current;
    // The read's result is only authoritative if no save overlapped its
    // round-trip; otherwise the save's echo wins (see saveCountRef comment).
    const supersededBySave = (): boolean =>
      saveInFlightAtStart > 0 || saveGenRef.current !== saveGenAtStart;

    try {
      const content = await read();

      if (supersededBySave()) return;

      setStatus({ kind: "ready", content });
    } catch (error: unknown) {
      if (supersededBySave()) return;

      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }, [read]);

  const save = useCallback(
    async (content: string): Promise<boolean> => {
      saveCountRef.current++;
      saveGenRef.current++;
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const stored = await write(content);

        setStatus({ kind: "ready", content: stored });
        setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        const message = errorMessage(error);

        setSaveError(message);
        setSaveStatus("error");

        return false;
      } finally {
        saveCountRef.current--;
      }
    },
    [write],
  );

  const clear = useCallback((): Promise<boolean> => save(""), [save]);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch when the window regains focus so device/AI writes that happened
  // while the tab was elsewhere surface when the user returns. The editor doc
  // is uncontrolled and seeded once, so this updates status without clobbering
  // an in-progress draft.
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  // Poll while the editor is open and the window is focused so external writes
  // surface within a few seconds without a manual refocus/reload. Focus-gated
  // to avoid idle background traffic. refresh() defers to in-flight saves, so a
  // tick mid-save can't clobber the echo. Cleanup ends polling on unmount.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hasFocus()) void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, [refresh]);

  return {
    status,
    saveStatus,
    saveError,
    save,
    clear,
    refresh,
  };
}

// --- Helpers below main export ---

/**
 * Extract a string error message from an unknown thrown value.
 * @param error - Caught value
 * @returns Message string
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
