// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A tiny navigation guard so a deep editor can veto a navigation that would
// silently abandon an unsaved draft. The memory editor registers a check while
// an unsaved NEW draft has content; the navigators that would unmount it — the
// context tab strip (tab switch, overlay close) and the collection list (select
// another entry) — call confirmLeave() first and only proceed when it approves
// (nothing registered, or the user confirmed the discard). Existing entries
// autosave, so only a brand-new draft ever registers a guard.

import { createContext } from "preact";
import { useContext, useEffect, useMemo, useRef } from "preact/hooks";

/** A registry letting one active editor gate navigation away from its draft. */
export interface LeaveGuard {
  /** Register the active editor's "may I leave?" check, or null to clear it. */
  register: (guard: (() => boolean) | null) => void;
  /**
   * Ask the registered editor whether navigation may proceed. True when nothing
   * is registered (no draft to lose) or the editor's guard approves (e.g. the
   * user confirmed the discard). Navigators call this before leaving.
   */
  confirmLeave: () => boolean;
}

/** A permissive guard: nothing registered, so navigation is never blocked. */
const NOOP_GUARD: LeaveGuard = {
  register: () => {},
  confirmLeave: () => true,
};

const LeaveGuardContext = createContext<LeaveGuard>(NOOP_GUARD);

/**
 * Create a ref-backed {@link LeaveGuard} for a provider. One editor at a time
 * registers its check; the navigators call confirmLeave first. Stable identity
 * across renders, so a consumer effect depending on it doesn't re-run per
 * keystroke.
 * @returns The guard registry to pass to {@link LeaveGuardContext.Provider}
 */
export function useLeaveGuard(): LeaveGuard {
  const guardRef = useRef<(() => boolean) | null>(null);

  return useMemo(
    () => ({
      register: (guard: (() => boolean) | null): void => {
        guardRef.current = guard;
      },
      confirmLeave: (): boolean =>
        guardRef.current == null || guardRef.current(),
    }),
    [],
  );
}

/**
 * Consume the ambient {@link LeaveGuard}. Falls back to a no-op registry when no
 * provider is present (e.g. a unit test rendering an editor in isolation), so
 * navigation is never blocked outside the tabbed editor.
 * @returns The ambient guard
 */
export function useLeaveGuardContext(): LeaveGuard {
  return useContext(LeaveGuardContext);
}

/**
 * Guard an in-progress draft against silent loss while `active`. Registers a
 * discard-confirm with the ambient {@link LeaveGuard} — the navigators that
 * would unmount the editor (tab strip, entry list, overlay close) call it first
 * — and prompts on browser-tab close via `beforeunload`. When `active` is false,
 * nothing is registered, so leaving is silent. Used by the memory editor for an
 * unsaved NEW draft (existing entries autosave, so they never activate it).
 * @param active - Whether an unsaved draft is present and should block leaving
 * @param confirmMessage - The window.confirm text shown before discarding
 */
export function useDraftLeaveGuard(
  active: boolean,
  confirmMessage: string,
): void {
  const leaveGuard = useLeaveGuardContext();

  useEffect(() => {
    if (!active) {
      leaveGuard.register(null);

      return undefined;
    }

    leaveGuard.register(() => window.confirm(confirmMessage));

    // preventDefault() is the modern way to trigger the browser's "leave site?"
    // dialog; the message itself is browser-controlled (returnValue is
    // deprecated).
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      leaveGuard.register(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, confirmMessage, leaveGuard]);
}

export { LeaveGuardContext };
