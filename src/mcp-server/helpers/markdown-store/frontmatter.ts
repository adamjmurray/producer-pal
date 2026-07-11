// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Minimal YAML-frontmatter parse/serialize for a config markdown file. Only a
// flat block of `key: value` string scalars is supported — enough for the
// skills-override provenance (fork-time version + built-in hash). Kept in-house
// rather than adding a YAML dependency: the shape is fixed and tiny.

/** A parsed markdown file: its frontmatter fields and the remaining body. */
export interface ParsedFrontmatter {
  /** Flat string key/value pairs from the leading `---` block ({} if none). */
  data: Record<string, string>;
  /** The document body after the frontmatter block (verbatim otherwise). */
  body: string;
}

const FENCE = "---";

/**
 * Split a markdown string into frontmatter fields and body. A file without a
 * leading `---` fence (the common case) yields empty `data` and the whole string
 * as `body`.
 *
 * The leading `---…---` block is only treated as frontmatter when EVERY line is
 * a `key: value` pair whose key is in `knownKeys` — the exact set the caller
 * writes. This is the discriminator between our frontmatter and a markdown
 * thematic break the user hand-authored: a single content line inside the fence
 * (`Remember: check the mix` → key "Remember"; a bare `https://…` → key "https")
 * matches the `identifier: value` shape but isn't a key we write, so it — and
 * the whole document — stays in the body rather than being silently swallowed
 * into metadata and dropped on the next re-serialize.
 *
 * @param raw - Full file contents
 * @param knownKeys - The frontmatter keys this caller recognizes/writes
 * @returns The parsed frontmatter fields and body
 */
export function parseFrontmatter(
  raw: string,
  knownKeys: readonly string[],
): ParsedFrontmatter {
  // Split on CRLF or LF: a Windows editor rewrites the file with `\r\n`, and a
  // trailing `\r` on the close line ("---\r") would otherwise never match FENCE,
  // dropping the provenance block AND injecting the literal fence into the body.
  const lines = raw.split(/\r?\n/);

  if (lines[0]?.trim() !== FENCE) {
    return { data: {}, body: raw };
  }

  const closeIndex = lines.indexOf(FENCE, 1);

  if (closeIndex === -1) {
    // Unterminated fence — treat the whole thing as body rather than guessing.
    return { data: {}, body: raw };
  }

  const known = new Set(knownKeys);
  const data: Record<string, string> = {};

  for (const line of lines.slice(1, closeIndex)) {
    if (line.trim() === "") continue; // blank lines inside the block are ignored

    const sep = line.indexOf(":");
    const key = sep === -1 ? "" : line.slice(0, sep).trim();

    // A line whose key isn't one we write means this leading `---…---` block is
    // a markdown thematic break wrapping content, not a frontmatter block. Keep
    // the WHOLE document as body: parsing the recognized-looking pairs out and
    // dropping the rest would silently delete the surrounding lines (a heading,
    // a prose sentence, a bare URL, a lone `Remember: …` note), and a later
    // re-serialize would make that loss permanent. `known.has("")` is false, so
    // a non-`key: value` line (no colon) is rejected here too.
    if (!known.has(key)) {
      return { data: {}, body: raw };
    }

    data[key] = line.slice(sep + 1).trim();
  }

  // An all-blank fenced block (`---` immediately followed by `---`, or only
  // blank lines between the fences) is a thematic break too — no pairs, so keep
  // the whole document as body rather than swallowing it into empty metadata
  // (ADR-0010 supports hand-edited files with no frontmatter).
  if (Object.keys(data).length === 0) {
    return { data: {}, body: raw };
  }

  return {
    data,
    body: lines
      .slice(closeIndex + 1)
      .join("\n")
      .replace(/^\n/, ""),
  };
}

/**
 * Serialize a flat frontmatter block above a body. Emits nothing extra when
 * `data` is empty (returns the body unchanged) so callers can round-trip a
 * provenance-free file.
 *
 * @param data - Flat string key/value pairs
 * @param body - Document body
 * @returns The combined frontmatter + body markdown
 */
export function serializeFrontmatter(
  data: Record<string, string>,
  body: string,
): string {
  const keys = Object.keys(data);

  if (keys.length === 0) return body;

  const block = keys.map((key) => `${key}: ${data[key]}`).join("\n");

  return `${FENCE}\n${block}\n${FENCE}\n\n${body}`;
}
