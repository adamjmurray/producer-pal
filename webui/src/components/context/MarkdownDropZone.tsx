// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from "preact/hooks";
import {
  classifyDroppedFile,
  dragHasFiles,
  NOT_MARKDOWN_MESSAGE,
  TOO_LARGE_MESSAGE,
} from "#webui/utils/text-file-io";

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
 * {@link MarkdownDropZone} — a rejected pick and a rejected drop both surface in
 * the same overlay. Lives here (not a standalone hook file) to stay under the
 * context folder's file cap.
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

interface MarkdownDropZoneProps {
  /** Called with the dropped file's text once read. */
  onImportText: (text: string) => void;
  /** The current rejection notice to show (from {@link useImportNotice}). */
  notice: string | null;
  /** Report a rejected drop (too-large / not-markdown) to the shared notice. */
  onReject: (message: string) => void;
  /** The editor region to wrap. */
  children: preact.ComponentChildren;
  /** Extra classes for the wrapping element (layout for the editor inside). */
  className?: string;
}

/**
 * Wraps an editor region and imports a markdown file dropped onto it. Drag
 * handlers run in the capture phase and stop propagation so the wrapped
 * CodeMirror editor never receives the file drop (its default handling would
 * otherwise insert the file). Non-file drags (e.g. CodeMirror's own text
 * reordering) are ignored and pass straight through. A dashed overlay shows
 * while a file is over the region; a rejected drop (or a rejected file-picker
 * import, via the shared {@link useImportNotice} `notice`) shows a red overlay.
 * @param props - Drop zone props
 * @returns Drop zone element
 */
export function MarkdownDropZone(
  props: MarkdownDropZoneProps,
): preact.JSX.Element {
  const { onImportText, notice, onReject, children, className } = props;
  const [dragging, setDragging] = useState(false);
  // Enter/leave fire per child element; a depth counter keeps the overlay from
  // flickering as the pointer crosses the editor's nested nodes.
  const depthRef = useRef(0);

  const handleDragEnter = (event: DragEvent): void => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    depthRef.current++;
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent): void => {
    if (!dragHasFiles(event.dataTransfer)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent): void => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    depthRef.current = 0;
    setDragging(false);

    const result = classifyDroppedFile(event.dataTransfer);

    if (result.kind === "file") {
      void result.file.text().then((text) => onImportText(text));
    } else if (result.kind === "not-markdown") {
      onReject(NOT_MARKDOWN_MESSAGE);
    } else if (result.kind === "too-large") {
      onReject(TOO_LARGE_MESSAGE);
    }
    // kind "none": the drop carried no file at all — nothing to report.
  };

  return (
    <div
      className={`relative ${className ?? ""}`}
      onDragEnterCapture={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-blue-500/70 bg-blue-500/10 text-sm font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
          Drop a .md file to import
        </div>
      )}
      {notice != null && !dragging && (
        <div
          role="alert"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-red-500/70 bg-red-500/10 text-sm font-medium text-red-700 dark:bg-red-400/10 dark:text-red-200"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

/**
 * Mark the region a valid drop target for a file drag.
 * @param event - The dragover event
 * @returns Nothing
 */
function handleDragOver(event: DragEvent): void {
  if (!dragHasFiles(event.dataTransfer)) return;
  // preventDefault marks this a valid drop target; stopPropagation keeps the
  // wrapped editor from handling (and inserting) the dragged file.
  event.preventDefault();
  event.stopPropagation();
}
