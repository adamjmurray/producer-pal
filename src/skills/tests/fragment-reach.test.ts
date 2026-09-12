// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { NOTATIONS } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";

// `object-paths` sat registered, slotted and tool-gated for a release without
// any driver naming it, so it shipped to nobody and an eval graded a document
// it was not in. Nothing caught it: the gate tests assert which tools WOULD
// pull a fragment, never that a driver asks for one.
describe("every fragment reaches a document", () => {
  const documents = NOTATIONS.flatMap((notation) =>
    [false, true].map((smallModelMode) =>
      buildSkills({ notation, smallModelMode }),
    ),
  );

  it.each(
    // No argument, so `code-transforms` resolves the same way it did for the
    // documents above — pass `true` here and it is non-empty in this list while
    // empty in every document, which reads as an orphan and is not one.
    Object.entries(builtinFragments())
      // The drivers are the roots that do the including, and the `-write`
      // placeholders a notation without an authoring half registers are empty
      // by design — neither can appear inside an assembled document.
      .filter(([name, body]) => !isDriver(name) && body.trim() !== "")
      .map(([name, body]) => ({ name, body })),
  )("$name is included by a driver", ({ body }) => {
    expect(documents.some((document) => document.includes(body))).toBe(true);
  });
});

/**
 * Whether a fragment name is one of the two driver roots.
 * @param name - Fragment name
 * @returns True for a driver
 */
function isDriver(name: string): boolean {
  return name === "standard" || name === "basic";
}
