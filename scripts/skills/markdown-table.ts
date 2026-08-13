// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Column alignment in the rendered table. */
export type ColumnAlign = "left" | "right" | "center";

/**
 * Render a padded markdown table. Padded rather than minimal because the skills
 * report is read as raw text in an editor as often as rendered.
 *
 * @param headers - Column headings
 * @param rows - Cell text, one array per row
 * @param aligns - Per-column alignment (defaults to left)
 * @returns The table markdown, no trailing newline
 */
export function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  aligns: readonly ColumnAlign[] = [],
): string {
  // Cell text is BMP-only (the ✓/– marks included), so UTF-16 length is the
  // display width. A dashed separator needs room for its alignment colons.
  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[column] ?? "").length),
      3,
    ),
  );
  const align = (column: number): ColumnAlign => aligns[column] ?? "left";
  // Driven by the column widths, not by the row: a row with fewer cells than
  // there are headers still has to emit every column, or it stops being a table.
  const line = (cells: readonly string[]): string =>
    `| ${widths.map((size, column) => pad(cells[column] ?? "", size, align(column))).join(" | ")} |`;

  return [
    line(headers),
    `| ${widths.map((w, column) => separator(w, align(column))).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

// --- Helpers below main export ---

/**
 * Pad a cell to a column width.
 *
 * @param text - Cell text
 * @param size - Column width
 * @param align - Column alignment
 * @returns The padded cell
 */
function pad(text: string, size: number, align: ColumnAlign): string {
  const slack = Math.max(0, size - text.length);

  if (align === "right") return " ".repeat(slack) + text;
  if (align === "left") return text + " ".repeat(slack);

  const left = Math.floor(slack / 2);

  return " ".repeat(left) + text + " ".repeat(slack - left);
}

/**
 * Build one column's dashed separator, carrying its alignment.
 *
 * @param size - Column width
 * @param align - Column alignment
 * @returns The separator cell
 */
function separator(size: number, align: ColumnAlign): string {
  if (align === "right") return "-".repeat(size - 1) + ":";
  if (align === "center") return ":" + "-".repeat(size - 2) + ":";

  return "-".repeat(size);
}
