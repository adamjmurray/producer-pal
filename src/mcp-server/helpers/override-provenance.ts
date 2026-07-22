// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared fork-time provenance + drift for user-content overrides that replace a
// release-tuned built-in (skills fragments, the custom system prompt). A saved
// override records the Producer Pal version and a hash of the built-in it forked
// from, in frontmatter, so we can later flag "the default changed since you
// forked". Provenance is stamped on save — never hand-authored. Kept here rather
// than in each store so the skills and system-prompt stores share one hashing +
// drift implementation.

import { createHash } from "node:crypto";
import { VERSION } from "#src/shared/config.ts";
import { serializeFrontmatter } from "./markdown-store/frontmatter.ts";

/** Fork-time provenance recorded in a saved override's frontmatter. */
export interface OverrideProvenance {
  /** Producer Pal version the override was forked from. */
  producerPalVersion: string;
  /** SHA-256 of the built-in at fork time. */
  builtInHash: string;
}

/**
 * The frontmatter keys a provenance-stamped override writes and reads. Passed to
 * `parseFrontmatter` so a leading `---…---` block is only treated as our
 * frontmatter when its keys are these — a hand-authored thematic break wrapping
 * content stays in the body. Kept beside {@link stampProvenance} /
 * {@link readProvenance} so the key set has one source of truth.
 */
export const PROVENANCE_FRONTMATTER_KEYS = [
  "producerPalVersion",
  "builtInHash",
] as const;

/**
 * SHA-256 of a built-in string, for fork-time provenance and drift detection.
 * Callers hash their (static) built-in once and reuse the digest.
 *
 * @param builtIn - The built-in fragment or prompt string
 * @returns Hex-encoded SHA-256 digest
 */
export function hashBuiltIn(builtIn: string): string {
  return createHash("sha256").update(builtIn).digest("hex");
}

/**
 * Serialize an override body beneath fork-time provenance frontmatter. The body
 * is written verbatim (callers decide trimming / trailing newline) so a
 * content-faithful store round-trips unchanged through the frontmatter layer.
 *
 * @param body - The override body to persist
 * @param builtInHash - Hash of the built-in being forked from ({@link hashBuiltIn})
 * @returns Markdown with a `---` provenance block above the body
 */
export function stampProvenance(body: string, builtInHash: string): string {
  return serializeFrontmatter(
    { producerPalVersion: VERSION, builtInHash },
    body,
  );
}

/**
 * Extract provenance from parsed frontmatter, or null when either field is
 * missing (a hand-authored override without provenance — never flagged drifted).
 *
 * @param data - Parsed frontmatter fields
 * @returns Provenance when both fields are present, else null
 */
export function readProvenance(
  data: Record<string, string>,
): OverrideProvenance | null {
  const producerPalVersion = data.producerPalVersion;
  const builtInHash = data.builtInHash;

  if (!producerPalVersion || !builtInHash) return null;

  return { producerPalVersion, builtInHash };
}

/**
 * Whether a stored override has drifted from the current built-in: it carries
 * provenance and the fork-time hash no longer matches the current one.
 *
 * @param provenance - The override's fork-time provenance (null when none)
 * @param currentHash - Hash of the current built-in ({@link hashBuiltIn})
 * @returns True when the built-in changed since the override was forked
 */
export function isDrifted(
  provenance: OverrideProvenance | null,
  currentHash: string,
): boolean {
  return provenance != null && provenance.builtInHash !== currentHash;
}
