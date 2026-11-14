// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useMemo, useRef } from "preact/hooks";

export interface ViewSequence {
  /** Mark a change of the chat on screen, and get its number */
  next: () => number;
  /** The number of the latest change */
  current: () => number;
}

/**
 * Count the changes of the chat on screen, so a load that finishes after a
 * later change (a switch, a new chat, a delete) knows not to take the screen
 * back.
 * @returns The counter; stable across renders
 */
export function useViewSequence(): ViewSequence {
  const seq = useRef(0);

  return useMemo(
    () => ({
      next: () => {
        seq.current += 1;

        return seq.current;
      },
      current: () => seq.current,
    }),
    [],
  );
}
