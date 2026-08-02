// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A `-write` split keeps the head slot's name, so an override made before the
// split is still live — and still holds the authoring half the driver now
// includes separately. Nothing else can see that: every include resolves and the
// document assembles. These cover the one signal there is, the overlap itself.

import { describe, expect, it } from "vitest";
import { buildSkills } from "#src/skills/build-skills.ts";
import {
  barbeatStandard,
  barbeatStandardWrite,
} from "#src/skills/notation/barbeat-standard.ts";
import { isSkillSlotName, SPLIT_SKILL_SLOTS } from "#src/skills/skill-slots.ts";

/**
 * Assemble with the given overrides, collecting any warnings.
 *
 * @param fragments - Override bodies keyed by slot name
 * @param disabled - Slots switched off
 * @returns The warnings raised
 */
function warningsFor(
  fragments: Record<string, string>,
  disabled: readonly string[] = [],
): string[] {
  const warnings: string[] = [];

  buildSkills({ notation: "barbeat" }, { fragments, disabled }, (message) =>
    warnings.push(message),
  );

  return warnings;
}

/** A pre-split fork of `barbeat-standard`: the whole guide, both halves. */
const PRE_SPLIT_FORK = `${barbeatStandard}\n\n${barbeatStandardWrite}`;

describe("buildSkills — overrides that predate a -write split", () => {
  it("warns, naming the sections that now ship twice", () => {
    const warnings = warningsFor({ "barbeat-standard": PRE_SPLIT_FORK });

    expect(warnings).toStrictEqual([
      expect.stringContaining(`"barbeat-standard.md" predates`),
    ]);
    expect(warnings[0]).toContain(`"## Writing Notes"`);
    expect(warnings[0]).toContain(`"## Examples"`);
    expect(warnings[0]).toContain(`"barbeat-standard-write"`);
  });

  it("stays quiet for a fork made after the split", () => {
    // The head's built-in carries none of the sibling's sections, so a fork of
    // it — edited or not — is not the stale shape.
    expect(warningsFor({ "barbeat-standard": barbeatStandard })).toStrictEqual(
      [],
    );
    expect(
      warningsFor({ "barbeat-standard": "My own notation guide" }),
    ).toStrictEqual([]);
  });

  it("stays quiet once the sibling is overridden or switched off", () => {
    // Either one means the user has already met the split: an override of the
    // sibling is a deliberate second body, and switching it off ships nothing
    // there is to duplicate.
    expect(
      warningsFor({
        "barbeat-standard": PRE_SPLIT_FORK,
        "barbeat-standard-write": "mine",
      }),
    ).toStrictEqual([]);
    expect(
      warningsFor({ "barbeat-standard": PRE_SPLIT_FORK }, [
        "barbeat-standard-write",
      ]),
    ).toStrictEqual([]);
  });

  it("pairs every split slot with a registered sibling", () => {
    for (const [head, write] of Object.entries(SPLIT_SKILL_SLOTS)) {
      expect(isSkillSlotName(head)).toBe(true);
      expect(isSkillSlotName(write)).toBe(true);
      expect(write).toBe(`${head}-write`);
    }
  });
});
