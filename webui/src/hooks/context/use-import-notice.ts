// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";

/** How long a rejection notice stays up after a bad import. */
const NOTICE_MS = 4000;

/** A transient rejection notice shown over the editor region. */
export interface ImportNotice {
  /** The message to show, or null when nothing is showing. */
  notice: string | null;
  /** Show a rejection message; auto-clears after {@link NOTICE_MS}. */
  showNotice: (message: string) => void;
  /**
   * Clear any showing notice at once (and cancel its auto-dismiss timer). The
   * screens call this when an import succeeds, so a stale rejection notice from
   * a prior bad drop/pick doesn't linger over the freshly-imported content for
   * the rest of its {@link NOTICE_MS} window.
   */
  clearNotice: () => void;
}

/**
 * Owns the transient import-rejection notice (state + auto-dismiss timer) so a
 * screen can share one notice surface between the file-picker button and the
 * drop zone — a rejected pick and a rejected drop both surface in the same
 * overlay.
 * @returns The current notice and a setter that auto-clears it
 */
export function useImportNotice(): ImportNotice {
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const showNotice = (message: string): void => {
    setNotice(message);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const clearNotice = (): void => {
    clearTimeout(noticeTimerRef.current);
    setNotice(null);
  };

  return { notice, showNotice, clearNotice };
}
