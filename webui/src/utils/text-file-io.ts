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

/** Rejection message when an imported file exceeds {@link MAX_IMPORT_BYTES}.
 *  Shared by the file-picker button and the drag-drop zone so both read alike. */
export const TOO_LARGE_MESSAGE = `File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`;

/** Rejection message when a chosen file can't be read. */
export const READ_ERROR_MESSAGE = "Couldn't read that file";

/** Rejection message when a dropped file isn't an importable markdown/text file. */
export const NOT_MARKDOWN_MESSAGE = "Not a markdown file";

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

/** Outcome of a file-picker import: the text, or why nothing was imported.
 *  A discriminated result (rather than text-or-null) lets the caller tell an
 *  oversized/unreadable file from a plain cancel, so the button can explain a
 *  rejection the way the drop zone already does. */
export type PickedTextResult =
  | { kind: "text"; text: string }
  | { kind: "too-large" }
  | { kind: "read-error" }
  | { kind: "cancel" };

/**
 * Open a native file picker and resolve the chosen file's text. Resolves a
 * `cancel` result when nothing is picked (via the input's `cancel` event, so
 * the promise never dangles on modern browsers; older ones without the event
 * fall back to staying pending, which callers already tolerate), `too-large`
 * when the file exceeds {@link MAX_IMPORT_BYTES}, and `read-error` when the read
 * fails.
 * @param accept - Input `accept` filter (e.g. {@link MARKDOWN_ACCEPT})
 * @returns The picked text, or the reason nothing was imported
 */
export function pickTextFile(accept: string): Promise<PickedTextResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = accept;
    input.oncancel = () => resolve({ kind: "cancel" });

    input.onchange = () => {
      const file = input.files?.[0];

      if (file == null) {
        resolve({ kind: "cancel" });

        return;
      }

      if (file.size > MAX_IMPORT_BYTES) {
        resolve({ kind: "too-large" });

        return;
      }

      void file.text().then(
        (text) => resolve({ kind: "text", text }),
        () => resolve({ kind: "read-error" }),
      );
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
