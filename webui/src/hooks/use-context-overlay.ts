// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type BackdropClickHandlers,
  useBackdropClick,
} from "#webui/hooks/use-backdrop-click";

// Mirrors useSettingsClose's fade timing so both overlays close alike.
const CONTEXT_ANIMATION_MS = 150;

/** What {@link useContextOverlay} hands back to the App. */
export interface ContextOverlayState {
  contextOpen: boolean;
  contextClosing: boolean;
  openContext: () => void;
  closeContext: () => void;
  /** Spread onto the overlay element — press, release, and click all matter. */
  contextBackdrop: BackdropClickHandlers;
  /** ContextTabs publishes its leave guard here. */
  contextConfirmLeaveRef: { current: (() => boolean) | null };
}

/**
 * Open/close state for the context overlay (project + global tabs; a sibling to
 * Settings), with its Escape and backdrop dismiss paths. Transient session
 * state, intentionally not persisted: a refresh, or a fresh tab opened from the
 * Max device, lands on chat and not the context editor.
 * @returns The overlay's state, its open/close handlers, and the leave-guard ref
 */
export function useContextOverlay(): ContextOverlayState {
  const [contextOpen, setContextOpen] = useState(false);
  const [contextClosing, setContextClosing] = useState(false);
  const openContext = useCallback(() => setContextOpen(true), []);
  const closeContext = useCallback(() => {
    setContextClosing(true);
    setTimeout(() => {
      setContextClosing(false);
      setContextOpen(false);
    }, CONTEXT_ANIMATION_MS);
  }, []);

  // The context editor's leave guard lives inside ContextTabs (which also mounts
  // standalone on /context, so the guard can't move up here). ContextTabs
  // publishes its confirmLeave into this ref so the overlay's Escape and
  // backdrop-click paths — which close from OUTSIDE that subtree — honor an
  // unsaved new-entry draft instead of silently discarding it. The header close
  // button is already guarded inside ContextTabs.
  const contextConfirmLeaveRef = useRef<(() => boolean) | null>(null);
  const attemptCloseContext = useCallback(() => {
    const confirmLeave = contextConfirmLeaveRef.current;

    if (confirmLeave == null || confirmLeave()) {
      closeContext();
    }
  }, [closeContext]);

  const contextBackdrop = useBackdropClick(
    useCallback(
      (e: MouseEvent) => {
        // Existing entries autosave, so a backdrop click is safe for them;
        // an unsaved new-entry draft is guarded (confirm before discard).
        // Only close on backdrop hits, not clicks inside the editor.
        if (e.target === e.currentTarget) {
          attemptCloseContext();
        }
      },
      [attemptCloseContext],
    ),
  );

  // Escape closes the context overlay (consistent with native modal idioms),
  // honoring the editor's leave guard for an unsaved draft.
  useEffect(() => {
    if (!contextOpen) {
      return undefined;
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        attemptCloseContext();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [contextOpen, attemptCloseContext]);

  return {
    contextOpen,
    contextClosing,
    openContext,
    closeContext,
    contextBackdrop,
    contextConfirmLeaveRef,
  };
}
