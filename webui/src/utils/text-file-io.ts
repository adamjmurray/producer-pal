// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Extensions accepted for text import — the single source the picker's accept
 *  filter and the drag-drop guard both derive from, so the two never diverge. */
const IMPORTABLE_EXTENSIONS = ["md", "markdown", "mdx", "txt"] as const;

/** Accept filter for text file inputs (file picker + drag-drop). */
export const MARKDOWN_ACCEPT = [
  ...IMPORTABLE_EXTENSIONS.map((ext) => `.${ext}`),
  "text/markdown",
  "text/plain",
].join(",");

/** Largest file (bytes) read into a markdown editor. Reading a huge file whole
 *  with `file.text()` would freeze the tab, so a bigger drop is rejected. */
export const MAX_IMPORT_BYTES = 1024 * 1024; // 1 MB

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
 * when nothing usable is picked, the file exceeds {@link MAX_IMPORT_BYTES}, or
 * the read fails. Resolves null on cancel too (via the input's `cancel` event),
 * so the promise never dangles on modern browsers; older ones without the event
 * fall back to staying pending, which callers already tolerate.
 * @param accept - Input `accept` filter (e.g. {@link MARKDOWN_ACCEPT})
 * @returns The file's text, or null
 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = accept;
    input.oncancel = () => resolve(null);

    input.onchange = () => {
      const file = input.files?.[0];

      if (file == null || file.size > MAX_IMPORT_BYTES) {
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

/** Outcome of inspecting the first file on a drop's data transfer. */
export type DroppedFileResult =
  | { kind: "file"; file: File }
  | { kind: "not-markdown" }
  | { kind: "too-large" }
  | { kind: "none" };

/**
 * Classify the first file on a drop's data transfer: an importable markdown/
 * text file, a non-markdown file, one over {@link MAX_IMPORT_BYTES}, or nothing
 * at all. Returning the reason (rather than a bare file-or-null) lets the drop
 * zone tell the user why a drop was rejected instead of silently swallowing it.
 * @param dt - The drop event's data transfer
 * @returns What the drop carried
 */
export function classifyDroppedFile(
  dt: DataTransfer | null,
): DroppedFileResult {
  const file = dt?.files[0];

  if (file == null) return { kind: "none" };
  if (!isImportableTextFile(file)) return { kind: "not-markdown" };
  if (file.size > MAX_IMPORT_BYTES) return { kind: "too-large" };

  return { kind: "file", file };
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

/** Matches an importable extension, built from the same {@link
 *  IMPORTABLE_EXTENSIONS} list the picker's accept filter uses. */
const IMPORTABLE_EXTENSION_RE = new RegExp(
  `\\.(${IMPORTABLE_EXTENSIONS.join("|")})$`,
  "i",
);

/**
 * Accept a dropped file as markdown by extension or a text/* MIME type.
 * Browsers frequently leave `type` empty for `.md`, so the extension check
 * carries most cases; the MIME check catches editors that tag it.
 * @param file - The dropped file
 * @returns True when the file should be imported as text
 */
function isImportableTextFile(file: File): boolean {
  if (IMPORTABLE_EXTENSION_RE.test(file.name)) return true;

  return file.type.startsWith("text/");
}
