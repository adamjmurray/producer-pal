// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from "preact/hooks";

/**
 * Route browser back/forward (hashchange) to the matching conversation, or to a
 * new one when the hash clears; the manager's own hash writes are skipped by a
 * ref flag. Back/Forward tears the conversation down as the sidebar does, which
 * stops a streaming turn — so it asks `confirmLeave` and puts the hash back.
 * @param params - Navigation dependencies (see the parameter type)
 */
export function useHashNavigation(params: {
  programmaticHashRef: { current: boolean };
  activeId: () => string | null;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  confirmLeave: () => boolean;
}): void {
  const {
    programmaticHashRef,
    activeId,
    switchConversation,
    startNewConversation,
    confirmLeave,
  } = params;

  useEffect(() => {
    const handler = () => {
      if (programmaticHashRef.current) {
        programmaticHashRef.current = false;

        return;
      }

      const hashId = getHashConversationId();

      if (hashId === activeId()) {
        return;
      }

      if (!confirmLeave()) {
        // The browser already moved; put the id back on the entry we landed on.
        // replaceState rather than assigning the hash: no new history entry, and
        // no second hashchange to re-enter this handler.
        restoreHash(activeId());

        return;
      }

      if (hashId) {
        void switchConversation(hashId);
      } else {
        startNewConversation();
      }
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [
    programmaticHashRef,
    activeId,
    switchConversation,
    startNewConversation,
    confirmLeave,
  ]);
}

/**
 * Read the conversation ID from the URL hash.
 * @returns The conversation ID, or null if no hash is set
 */
export function getHashConversationId(): string | null {
  const hash = window.location.hash.slice(1);

  return hash || null;
}

/**
 * Set the URL hash to the given conversation ID (or clear it).
 * @param id - Conversation ID, or null to clear the hash
 */
export function setLocationHash(id: string | null): void {
  if (id) {
    window.location.hash = id;
  } else {
    // Remove hash without scrolling — pushState avoids hashchange event issues
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

/**
 * Rewrite the current history entry's hash without firing a hashchange.
 * @param id - Conversation id to put back, or null to clear the hash
 */
function restoreHash(id: string | null): void {
  const base = window.location.pathname + window.location.search;

  history.replaceState(null, "", id ? `${base}#${id}` : base);
}
