// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef } from "preact/hooks";

/** The overlay element's mouse handlers — spread all three, or none. */
export interface BackdropClickHandlers {
  onMouseDown: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
  onClick: (e: MouseEvent) => void;
}

/**
 * Overlay handlers that report a backdrop click only when the press and the
 * release both landed on the element the click fired on. A click event fires on
 * the nearest common ancestor of the two, so without this a drag between the
 * panel and the backdrop reads as a backdrop click and dismisses the overlay —
 * in either direction, which is why the release is tracked too: on a
 * backdrop-to-panel drag the press alone still matches.
 * @param {(e: MouseEvent) => void} onBackdropClick - Called with the click event when press and release match
 * @returns {BackdropClickHandlers} mousedown/mouseup/click handlers for the overlay element
 */
export function useBackdropClick(
  onBackdropClick: (e: MouseEvent) => void,
): BackdropClickHandlers {
  const pressTargetRef = useRef<EventTarget | null>(null);
  const releaseTargetRef = useRef<EventTarget | null>(null);

  const onMouseDown = useCallback((e: MouseEvent) => {
    pressTargetRef.current = e.target;
    releaseTargetRef.current = null;
  }, []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    releaseTargetRef.current = e.target;
  }, []);

  const onClick = useCallback(
    (e: MouseEvent) => {
      const pressTarget = pressTargetRef.current;
      const releaseTarget = releaseTargetRef.current;

      pressTargetRef.current = null;
      releaseTargetRef.current = null;

      if (pressTarget !== e.target || releaseTarget !== e.target) return;

      onBackdropClick(e);
    },
    [onBackdropClick],
  );

  return { onMouseDown, onMouseUp, onClick };
}
