// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Accept filter for markdown file inputs (file picker + drag-drop). */
export const MARKDOWN_ACCEPT = ".md,.markdown,text/markdown";

/**
 * Download a string as a file via a transient object-URL anchor. Mirrors the
 * conversation exporter's Blob → anchor → revoke pattern.
 * @param filename - Suggested download filename
 * @param content - File body
 */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a native file picker and resolve the chosen file's text. Resolves null
 * when nothing usable is picked or the read fails. (The browser fires no event
 * on cancel, so a cancelled picker leaves the promise pending — callers just
 * never act, matching the conversation importer.)
 * @param accept - Input `accept` filter (e.g. {@link MARKDOWN_ACCEPT})
 * @returns The file's text, or null
 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = accept;

    input.onchange = () => {
      const file = input.files?.[0];

      if (file == null) {
        resolve(null);

        return;
      }

      void file.text().then(resolve, () => resolve(null));
    };

    input.click();
  });
}

/**
 * Whether a drag currently carries file(s). During `dragover` the file list is
 * empty (populated only on drop), so the overlay must gate on `types` instead.
 * @param dt - The drag event's data transfer
 * @returns True when a file is being dragged
 */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  return dt?.types.includes("Files") ?? false;
}

/**
 * Pull the first importable markdown/plain-text file from a drop's data
 * transfer, or null if the drop carries no such file (dragged text, or a
 * non-text file we shouldn't load into a markdown editor).
 * @param dt - The drop event's data transfer
 * @returns The file to import, or null
 */
export function markdownFileFromDataTransfer(
  dt: DataTransfer | null,
): File | null {
  const file = dt?.files[0];

  if (file == null) return null;

  return isImportableTextFile(file) ? file : null;
}

/**
 * Build a dated, slugified `.md` export filename. Browsers append `(n)` on
 * collisions, so the date keeps repeat exports readable rather than unique.
 * @param basename - Human basename (e.g. "producer-pal-global-context")
 * @returns `<slug>-<yyyy-mm-dd>.md`
 */
export function markdownExportFilename(basename: string): string {
  const slug = basename
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
  const date = new Date().toISOString().slice(0, 10);

  return `${slug}-${date}.md`;
}

// --- Helpers below main exports ---

/**
 * Accept a dropped file as markdown by extension or a text/* MIME type.
 * Browsers frequently leave `type` empty for `.md`, so the extension check
 * carries most cases; the MIME check catches editors that tag it.
 * @param file - The dropped file
 * @returns True when the file should be imported as text
 */
function isImportableTextFile(file: File): boolean {
  if (/\.(md|markdown|mdx|txt)$/i.test(file.name)) return true;

  return file.type.startsWith("text/");
}
