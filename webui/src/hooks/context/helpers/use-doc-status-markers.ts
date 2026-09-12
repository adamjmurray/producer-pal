// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";
import { type DocStatus } from "#webui/hooks/context/use-doc";

/** What {@link useDocStatusMarkers} needs from the editor-state hook. */
export interface DocStatusMarkersParams {
  /** The document hook's current status. */
  status: DocStatus;
  /** The editor's current draft text, or null before the first seed. */
  draftRef: { current: string | null };
  /** The last value known to be on the server. */
  lastSavedRef: { current: string | null };
  setCharCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  setExternalUpdate: (externalUpdate: boolean) => void;
  setHasOverride: (hasOverride: boolean) => void;
}

/**
 * Keep the editor's draft markers and banners in step with the document's
 * status: seed them on the first ready, null them on an error, and raise the
 * "updated outside the editor" banner when the server's content moves under a
 * clean draft.
 * @param params - The editor's draft markers and state setters, plus the status
 */
export function useDocStatusMarkers(params: DocStatusMarkersParams): void {
  const {
    status,
    draftRef,
    lastSavedRef,
    setCharCount,
    setDirty,
    setExternalUpdate,
    setHasOverride,
  } = params;

  // Seed the draft markers from the server when the doc first becomes ready.
  // Only on first ready: subsequent status updates (save echoes, AI writes,
  // toggle flips) must not blow away the user's in-progress draft.
  useEffect(() => {
    if (status.kind !== "ready") {
      return;
    }

    if (draftRef.current != null) {
      return;
    }

    draftRef.current = status.content;
    lastSavedRef.current = status.content;
    setCharCount(status.content.length);
    // Decide override-vs-built-in structure from the seed content, once.
    setHasOverride(status.content !== "");
  }, [status, draftRef, lastSavedRef, setCharCount, setHasOverride]);

  // Null the draft markers on transition to error. Without this, a recovery
  // (error → ready) leaves the refs pointed at the pre-error value because
  // the seed-on-first-ready effect above bails when draftRef is set; a
  // subsequent beforeunload would then flush the stale value over the
  // server's recovered content.
  useEffect(() => {
    if (status.kind !== "error") {
      return;
    }

    draftRef.current = null;
    lastSavedRef.current = null;
    setExternalUpdate(false);
    setDirty(false);
    setCharCount(0);
  }, [
    status,
    draftRef,
    lastSavedRef,
    setCharCount,
    setDirty,
    setExternalUpdate,
  ]);

  // Surface an "external update" banner when an AI/device write changes
  // status.content out from under the uncontrolled editor AND the user has
  // no in-progress diff (draftRef === lastSavedRef). Clean-draft is the
  // safe case — reloading discards nothing the user typed.
  useEffect(() => {
    if (status.kind !== "ready") {
      return;
    }

    if (lastSavedRef.current == null) {
      return;
    }

    const serverContent = status.content;

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

    if (draftRef.current !== lastSavedRef.current) {
      return;
    }

    setExternalUpdate(true);
  }, [status, draftRef, lastSavedRef, setExternalUpdate]);
}
