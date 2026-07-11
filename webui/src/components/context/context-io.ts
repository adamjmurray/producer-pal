// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  downloadTextFile,
  MARKDOWN_ACCEPT,
  markdownExportFilename,
  pickTextFile,
  READ_ERROR_MESSAGE,
  TOO_LARGE_MESSAGE,
} from "#webui/utils/text-file-io";

/** The subset of the editor-state hook the import/export handlers need. */
export interface EditorIoTarget {
  handleImport: (content: string) => Promise<void>;
  getContent: () => string;
}

/** Wired import/export handlers for an editor's controls strip + drop zone. */
export interface ContextIoHandlers {
  /** File-picker import (controls-strip "Import" button). */
  onImport: () => void;
  /** Export the current content to a dated `.md` file. */
  onExport: () => void;
  /** Apply already-read text (drag-drop). Shares the picker's import path. */
  onImportText: (text: string) => void;
}

/**
 * Build the import/export handlers shared by the context and skills editors:
 * the file picker, the drag-drop apply, and the `.md` export. Both editors wire
 * their controls-strip buttons and {@link MarkdownDropZone} to these.
 * @param editor - The editor-state hook (import/getContent surface)
 * @param exportBasename - Human basename for the export file (dated + slugified)
 * @param onImportError - Surface a picker rejection (too-large/unreadable) to the
 *   user, mirroring the drop zone's notice; a plain cancel stays silent
 * @returns The wired handlers
 */
export function makeContextIoHandlers(
  editor: EditorIoTarget,
  exportBasename: string,
  onImportError?: (message: string) => void,
): ContextIoHandlers {
  const onImportText = (text: string): void => void editor.handleImport(text);

  const onImport = (): void => {
    void pickTextFile(MARKDOWN_ACCEPT).then((result) => {
      if (result.kind === "text") onImportText(result.text);
      else if (result.kind === "too-large") onImportError?.(TOO_LARGE_MESSAGE);
      else if (result.kind === "read-error")
        onImportError?.(READ_ERROR_MESSAGE);
      // "cancel": the user dismissed the picker — nothing to report.
    });
  };

  const onExport = (): void =>
    downloadTextFile(
      markdownExportFilename(exportBasename),
      editor.getContent(),
    );

  return { onImport, onExport, onImportText };
}
