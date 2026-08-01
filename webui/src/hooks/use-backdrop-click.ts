// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef } from "preact/hooks";

interface BackdropClickHandlers {
  onMouseDown: (e: MouseEvent) => void;
  onClick: (e: MouseEvent) => void;
}

/**
 * Overlay handlers that report a backdrop click only when the press and the
 * release landed on the same element. A click event fires on the nearest common
 * ancestor of the two, so without this a drag that starts inside the panel and
 * ends on the backdrop reads as a backdrop click and dismisses the overlay.
 * @param {(e: MouseEvent) => void} onBackdropClick - Called with the click event when press and release match
 * @returns {BackdropClickHandlers} mousedown/click handlers for the overlay element
 */
export function useBackdropClick(
  onBackdropClick: (e: MouseEvent) => void,
): BackdropClickHandlers {
  const pressTargetRef = useRef<EventTarget | null>(null);

  const onMouseDown = useCallback((e: MouseEvent) => {
    pressTargetRef.current = e.target;
  }, []);

  const onClick = useCallback(
    (e: MouseEvent) => {
      const pressTarget = pressTargetRef.current;

      pressTargetRef.current = null;

      if (pressTarget !== e.target) return;

      onBackdropClick(e);
    },
    [onBackdropClick],
  );

  return { onMouseDown, onClick };
}
