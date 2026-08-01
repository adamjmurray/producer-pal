// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { NOTATIONS } from "#src/shared/notation.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";

// Syntax that belongs to ONE notation. A neutral fragment naming any of it is
// teaching a caller on another notation something untrue — the notation axis's
// version of the tool bleed fragment-tool-gates.test.ts catches.
//
// Syntax only, not prose: this can't see a claim like "same as notes". Positions
// and note values are shared grammar (time-and-values) and are deliberately
// absent here.
const NOTATION_SYNTAX = [
  { label: "a bar|beat repeat pattern", pattern: /\d\|[\d.]+x\d/ },
  { label: "a bar|beat bar copy", pattern: /@\d+(-\d+)?=/ },
  { label: '"repeat pattern"', pattern: /repeat pattern/i },
  { label: '"pattern bracket"', pattern: /pattern bracket/i },
  { label: '"bar copy"', pattern: /bar[ -]cop(y|ies|ying)/i },
  { label: "stark", pattern: /\bstark\b/i },
  { label: "midi-json", pattern: /midi[ -]json/i },
  { label: "a midi-json note object", pattern: /\{p:\d/ },
];

/**
 * Whether a fragment is one of the note-format guides, which are the only
 * fragments allowed to teach a single notation.
 *
 * @param name - Fragment name
 * @returns True for a notation head (its depth and `-write` siblings included)
 */
function isNotationHead(name: string): boolean {
  return NOTATIONS.some((notation) => name.startsWith(notation));
}

describe("notation neutrality", () => {
  // Code exec on, so the debug-only fragment is checked too.
  const neutral = Object.entries(builtinFragments(true)).filter(
    ([name]) => !isNotationHead(name),
  );

  it("keeps notation syntax out of every other fragment", () => {
    // The drivers are in here too — `basic` inlines prose, and a leak has
    // reached fragment prose before.
    for (const [name, body] of neutral) {
      for (const { label, pattern } of NOTATION_SYNTAX) {
        expect(pattern.test(body), `${name} names ${label}`).toBe(false);
      }
    }
  });

  it("matches every pattern against some notation head", () => {
    // A typo'd regex would pass the test above forever. Each pattern has to
    // still find the syntax it was written for.
    const heads = Object.entries(builtinFragments(true))
      .filter(([name]) => isNotationHead(name))
      .map(([, body]) => body);

    for (const { label, pattern } of NOTATION_SYNTAX) {
      expect(
        heads.some((body) => pattern.test(body)),
        `no notation head names ${label} — the pattern is dead`,
      ).toBe(true);
    }
  });
});
