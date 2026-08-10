// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { errorMessage } from "#src/shared/error-utils";

/** How often to re-read the document while the editor is open and focused. */
const POLL_INTERVAL_MS = 5000;

/** Status of a single markdown document's body. */
export type DocStatus =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "error"; message: string };

/** Save lifecycle state */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Fork-time drift for a document that overrides a shipped built-in (custom
 * instructions): whether the built-in changed since this override was forked,
 * and the Producer Pal version it was forked from. Documents with no built-in
 * (project/global context) never carry it.
 */
export interface DocDrift {
  drifted: boolean;
  forkedFromVersion: string | null;
}

/** The content plus optional drift metadata a transport read/write resolves to. */
export interface DocRead {
  content: string;
  drift?: DocDrift;
}

export interface UseDocReturn {
  status: DocStatus;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Write content to the document. Resolves true on success, false on failure. */
  save: (content: string) => Promise<boolean>;
  /** Clear stored content. Same channel as save(""). */
  clear: () => Promise<boolean>;
  /** Re-read the document from the server (e.g. when the tab becomes visible). */
  refresh: () => Promise<void>;
  /** Fork-time drift, for documents that override a built-in (undefined otherwise). */
  drift?: DocDrift;
}

/**
 * Read/write a single markdown document over an injected transport, with the
 * save/refresh coordination the editor needs: optimistic save status, focus +
 * interval polling for external writes, and a guard so a slow refresh GET can't
 * clobber a concurrent save's echo. `useProjectContext` (project context via
 * /config), `useGlobalContext`, and `useSystemPrompt` are thin
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
export function useDoc(
  read: () => Promise<DocRead>,
  write: (content: string) => Promise<DocRead>,
): UseDocReturn {
  const [status, setStatus] = useState<DocStatus>({ kind: "loading" });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drift, setDrift] = useState<DocDrift | undefined>(undefined);
  const { beginSave, endSave, guardRefresh } = useSaveRefreshGuard();

  const refresh = useCallback(
    (): Promise<void> =>
      runGuardedRefresh(
        guardRefresh,
        read,
        (result) => {
          setStatus({ kind: "ready", content: result.content });
          setDrift(result.drift);
        },
        (message) => setStatus({ kind: "error", message }),
      ),
    [read, guardRefresh],
  );

  const save = useCallback(
    async (content: string): Promise<boolean> => {
      // Two saves can overlap (a debounced flush, then a blur or another
      // keystroke's flush before the first echo lands). Whichever echo arrives
      // LAST would otherwise win the state, so an older save landing late would
      // revert the editor to superseded content: commit only while this save is
      // still the newest one issued. The outcome is still reported truthfully —
      // it's the state commit that is superseded, not the write.
      const discardSave = beginSave();

      setSaveStatus("saving");
      setSaveError(null);

      try {
        const stored = await write(content);

        if (discardSave()) return true;

        setStatus({ kind: "ready", content: stored.content });
        setDrift(stored.drift);
        setSaveStatus("saved");

        return true;
      } catch (error: unknown) {
        if (discardSave()) return false;

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

  useRefreshOnFocusAndPoll(refresh);

  return {
    status,
    saveStatus,
    saveError,
    save,
    clear,
    refresh,
    drift,
  };
}

// --- Shared save/refresh coordination (also used by useSkillOverrides) ---

/** Save/refresh race coordination primitives (see {@link useSaveRefreshGuard}). */
export interface SaveRefreshGuard {
  /** Mark a save started (before its write begins). The returned predicate
   *  reports whether THIS save's result should be DISCARDED — a newer save was
   *  issued after it (whose echo is the one the UI must keep), or the component
   *  unmounted while it was in flight. */
  beginSave: () => () => boolean;
  /** Mark a save finished (in the write's finally). */
  endSave: () => void;
  /** True once the component has unmounted — the half of `beginSave`'s
   *  predicate a collection hook wants on its own, since ordering there is per
   *  entry ({@link useWriteOrdering}) rather than newest-write-wins. */
  isUnmounted: () => boolean;
  /** Snapshot the guard at a refresh's start; the returned predicate reports
   *  whether the refresh's result should be DISCARDED — because a save overlapped
   *  its round-trip (the save's echo should win) or the component unmounted while
   *  it was in flight (nothing left to update). */
  guardRefresh: () => () => boolean;
}

/**
 * Coordinate refresh() reads against in-flight save() writes, shared by the
 * single-document ({@link useDoc}) and slot-collection (useSkillOverrides)
 * doc hooks. A focus/poll read can resolve older data than a concurrent
 * save's echo and, landing last, clobber it. `beginSave`/`endSave` bracket each
 * write (an in-flight counter plus a monotonic generation counter); a refresh
 * calls `guardRefresh()` at its start and trusts its result only if no save
 * overlapped the round-trip. The same predicate also reports true once the
 * component has unmounted, so a late-resolving fetch can't setState on a dead
 * component (matching the AbortController guard the preview/config hooks use).
 *
 * The same generation counter orders saves against EACH OTHER: `beginSave`
 * returns a predicate that reports whether its own save has since been
 * superseded, so an older write's echo landing last can't revert the UI to
 * content the user has already typed past.
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

  const beginSave = useCallback((): (() => boolean) => {
    saveCountRef.current++;
    const generation = ++saveGenRef.current;

    return (): boolean =>
      !mountedRef.current || saveGenRef.current !== generation;
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

  const isUnmounted = useCallback((): boolean => !mountedRef.current, []);

  return { beginSave, endSave, guardRefresh, isUnmounted };
}

/** Per-target write ordering (see {@link useWriteOrdering}). */
export interface WriteOrdering {
  /**
   * Stamp the targets a write is about to touch. The returned predicate reports
   * whether this write has since been SUPERSEDED — a later write claimed one of
   * the same targets — so its result must not be committed.
   */
  claim: (...names: string[]) => () => boolean;
}

/**
 * Order writes against each other WITHIN a collection, where "newest write
 * wins" (what {@link useSaveRefreshGuard}'s generation counter gives a single
 * document) is too coarse: saving entry B must not discard entry A's echo.
 * Each write stamps the names it touches with a monotonic sequence number, and
 * a stamp overwritten by a later write invalidates the earlier one's commit —
 * so two overlapping saves of ONE entry resolve to the newest, and a delete
 * beats a slower save it was issued after, while unrelated entries never
 * interfere. Shared by the entry collections (`useDocCollection`) and the skill
 * slots (`useSkillOverrides`).
 * @returns The claim helper
 */
export function useWriteOrdering(): WriteOrdering {
  const sequenceRef = useRef(0);
  const latestRef = useRef<Map<string, number>>(new Map());

  const claim = useCallback((...names: string[]): (() => boolean) => {
    const sequence = ++sequenceRef.current;

    for (const name of names) latestRef.current.set(name, sequence);

    return (): boolean =>
      names.some((name) => latestRef.current.get(name) !== sequence);
  }, []);

  return { claim };
}

// --- Collection save lifecycle (shared by useDocCollection and
// useSkillOverrides) ---
//
// Both collection hooks drive one save-status indicator scoped to the entry
// being edited, order overlapping writes per entry, and defer to the refresh
// guard above. Only what they read and merge differs, which is the caller's
// `commit`.

/** The save-side state and actions shared by the collection hooks. */
export interface CollectionMutator {
  /** Status of the most recent write for the entry currently being edited. */
  saveStatus: SaveStatus;
  /** Message of the most recent failed write, or null. */
  saveError: string | null;
  /** Detach the indicator from the previous entry when the selection changes. */
  resetSaveStatus: () => void;
  /** The refresh guard snapshot factory (see {@link useSaveRefreshGuard}). */
  guardRefresh: () => () => boolean;
  /**
   * Run one mutation: mark saving, run `op`, commit its result on success,
   * record the error on failure, and always clear the in-flight guard. `names`
   * are the entries the mutation targets — its result is committed only while
   * it is still the newest write for all of them (see
   * {@link useWriteOrdering}). Resolves `op`'s result, or null on failure, so a
   * void-resolving op (a delete) maps success to `result !== null`.
   */
  mutate: <T>(
    op: () => Promise<T>,
    commit: (result: T) => void,
    names: string[],
  ) => Promise<T | null>;
}

/**
 * Save lifecycle for a ~/.producer-pal collection hook: the status indicator,
 * per-entry write ordering, and the save-vs-refresh guard.
 * @returns The save-side state plus the `mutate` runner and refresh guard
 */
export function useCollectionMutator(): CollectionMutator {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Bumped whenever the edited entry changes (via resetSaveStatus). A save
  // captures this at dispatch; if it has advanced by the time the save
  // resolves, the user switched entries, so the outcome must not paint the
  // shared "saved"/"error" indicator onto the now-active entry (the list merge
  // still applies — only the status indicator is entry-scoped).
  const saveGenerationRef = useRef(0);
  // Per-ENTRY write ordering, distinct from saveGenerationRef (which scopes the
  // status indicator to the selected entry): a slow earlier save landing after a
  // newer one must not revert that entry in the cached list.
  const { claim } = useWriteOrdering();
  const { beginSave, endSave, guardRefresh, isUnmounted } =
    useSaveRefreshGuard();

  const mutate = useCallback(
    async <T>(
      op: () => Promise<T>,
      commit: (result: T) => void,
      names: string[],
    ): Promise<T | null> => {
      const generation = saveGenerationRef.current;
      // Ordering is per entry, NOT newest-write-wins: beginSave's own predicate
      // would let a save of entry B discard entry A's echo. Only its
      // unmounted half applies here.
      const superseded = claim(...names);

      beginSave();
      setSaveStatus("saving");
      setSaveError(null);

      try {
        const result = await op();

        if (isUnmounted()) return result;
        if (!superseded()) commit(result);

        // A superseded write is discarded, so it must not paint "Saved" either:
        // the newer write for this entry is still on the wire, and the indicator
        // has to keep reading "Saving…" until IT lands. Whichever write finishes
        // last owns the file, and only its outcome describes what is on disk.
        if (!superseded() && saveGenerationRef.current === generation) {
          setSaveStatus("saved");
        }

        return result;
      } catch (error: unknown) {
        if (isUnmounted()) return null;

        // Same superseded check as the success path, for the same reason: a
        // newer write for this entry owns the file, so a stale failure must not
        // paint "error" over its result — or over the "Saving…" it is still
        // showing. Whichever write finishes last is the one that describes disk.
        if (!superseded() && saveGenerationRef.current === generation) {
          setSaveError(errorMessage(error));
          setSaveStatus("error");
        }

        return null;
      } finally {
        endSave();
      }
    },
    [beginSave, endSave, claim, isUnmounted],
  );

  const resetSaveStatus = useCallback((): void => {
    saveGenerationRef.current += 1;
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  return { saveStatus, saveError, resetSaveStatus, guardRefresh, mutate };
}

/**
 * Run one guarded refresh: load via `load`, then commit through `onReady` UNLESS
 * the read was superseded — the component unmounted or a concurrent save landed
 * after this read started (see {@link useSaveRefreshGuard}) — in which case the
 * result is dropped. A failure commits through `onError` under the same guard.
 * The document, collection, and slot hooks all need this exact discard-on-stale
 * shape, so it lives here in one place rather than copied into each refresh.
 * @param guardRefresh - The guard snapshot factory from {@link useSaveRefreshGuard}
 * @param load - Fetches the fresh data
 * @param onReady - Commit for successful data (typically a setStatus "ready")
 * @param onError - Commit for a failure message (typically a setStatus "error")
 */
export async function runGuardedRefresh<T>(
  guardRefresh: () => () => boolean,
  load: () => Promise<T>,
  onReady: (data: T) => void,
  onError: (message: string) => void,
): Promise<void> {
  const discardRefresh = guardRefresh();

  try {
    const data = await load();

    if (discardRefresh()) return;

    onReady(data);
  } catch (error: unknown) {
    if (discardRefresh()) return;

    onError(errorMessage(error));
  }
}

/**
 * Load once on mount, then refresh on window focus and on a focus-gated
 * interval so external writes (device/AI/hand edits made while the tab was
 * elsewhere) surface within a few seconds without a manual reload. Polling is
 * gated on `document.hasFocus()` to avoid idle background traffic; the focus
 * listener fires unconditionally on return. The refresh must defer to in-flight
 * saves (see {@link useSaveRefreshGuard}) so a tick mid-save can't clobber the
 * echo.
 * @param refresh - Stable refresh callback for the initial load, focus, and each poll tick
 */
export function useRefreshOnFocusAndPoll(
  refresh: () => void | Promise<void>,
): void {
  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    void refresh();
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

/**
 * Server shape for the single-content markdown doc endpoints. `drifted` /
 * `forkedFromVersion` are present only for endpoints that back an override of a
 * shipped built-in (the custom system prompt); absent otherwise.
 */
interface ContentResponse {
  content?: string;
  drifted?: boolean;
  forkedFromVersion?: string | null;
}

/** A stable read/write transport pair for {@link useDoc}. */
export interface ContentTransport {
  read: () => Promise<DocRead>;
  write: (content: string) => Promise<DocRead>;
}

/**
 * Build a read/write transport for a single-content markdown endpoint that
 * speaks GET(no-store)→{content} and PUT(JSON {content})→{content}. The system
 * prompt and global context endpoints are identical but for their URL and error
 * label, so they share this factory; the system prompt's response also carries
 * drift fields, surfaced when present. Call it once at module scope so the pair
 * is a stable reference (see {@link useDoc}).
 * @param url - The endpoint URL
 * @param label - Human label for error copy (e.g. "System prompt")
 * @returns The stable { read, write } transport pair
 */
export function makeContentTransport(
  url: string,
  label: string,
): ContentTransport {
  const read = async (): Promise<DocRead> => {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        `${label} request failed (${response.status} ${response.statusText})`,
      );
    }

    return toDocRead((await response.json()) as ContentResponse);
  };

  const write = async (content: string): Promise<DocRead> => {
    // Deliberately NOT `keepalive: true` (unlike the collection transport's
    // small-entry writes): a context / custom-system-prompt body can be imported
    // up to ~1MB, and a keepalive fetch whose body exceeds the browser's ~64KB
    // quota rejects outright — that would regress ordinary large-doc saves to fix
    // only the rare beforeunload drop. On localhost the flush completes in a few
    // ms, so that drop window is negligible; the size safety is the better trade.
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

    return toDocRead((await response.json()) as ContentResponse);
  };

  return { read, write };
}

/**
 * Map a single-content endpoint response to a {@link DocRead}, attaching drift
 * only when the endpoint reported it (`drifted` present).
 * @param body - The parsed endpoint response
 * @returns The content plus optional drift
 */
function toDocRead(body: ContentResponse): DocRead {
  return {
    content: body.content ?? "",
    drift:
      body.drifted == null
        ? undefined
        : {
            drifted: body.drifted,
            forkedFromVersion: body.forkedFromVersion ?? null,
          },
  };
}
