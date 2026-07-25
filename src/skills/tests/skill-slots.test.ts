// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  isSkillSlotName,
  RETIRED_SKILL_SLOTS,
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";

describe("SKILL_SLOTS registry", () => {
  it("registers every slot name with a non-empty definition", () => {
    for (const name of SKILL_SLOT_NAMES) {
      const slot = SKILL_SLOTS[name];

      expect(slot.title.length).toBeGreaterThan(0);
      expect(slot.builtIn.length).toBeGreaterThan(0);
    }
  });

  it("gives each slot a distinct built-in fragment", () => {
    const builtIns = SKILL_SLOT_NAMES.map((name) => SKILL_SLOTS[name].builtIn);

    expect(new Set(builtIns).size).toBe(SKILL_SLOT_NAMES.length);
  });
});

describe("SKILL_SLOTS requires", () => {
  it("never lists a slot as needing itself", () => {
    for (const name of SKILL_SLOT_NAMES) {
      expect(SKILL_SLOTS[name].requires ?? []).not.toContain(name);
    }
  });

  it("closes transitively without a cycle", () => {
    // The per-worker selection closes a set by walking these edges, so a cycle
    // there is an infinite walk rather than a bad document.
    for (const start of SKILL_SLOT_NAMES) {
      const seen = new Set<string>();
      const queue = [...(SKILL_SLOTS[start].requires ?? [])];

      while (queue.length > 0) {
        const next = queue.shift() as SkillSlotName;

        expect(next, `${start} requires a cycle through ${next}`).not.toBe(
          start,
        );

        if (seen.has(next)) continue;

        seen.add(next);
        queue.push(...(SKILL_SLOTS[next].requires ?? []));
      }
    }
  });

  it("is satisfied by the standard driver for every fragment it includes", () => {
    // Guards the built-in manifest itself: a fragment whose prerequisite the
    // driver never includes would ship the broken subset by default.
    const included = new Set(
      [
        ...SKILL_SLOTS.standard.builtIn.matchAll(
          /@include\s+"\.\/([^"]+)\.md"/g,
        ),
      ].map((match) => match[1]),
    );

    for (const name of SKILL_SLOT_NAMES) {
      if (!included.has(name)) continue;

      for (const required of SKILL_SLOTS[name].requires ?? []) {
        expect(included.has(required), `${name} needs ${required}`).toBe(true);
      }
    }
  });
});

describe("RETIRED_SKILL_SLOTS", () => {
  it("never names a slot that is still registered", () => {
    // A name in both places would warn "no longer used" about a live override.
    for (const name of Object.keys(RETIRED_SKILL_SLOTS)) {
      expect(isSkillSlotName(name)).toBe(false);
    }
  });

  it("points every retired name at slots that exist today", () => {
    for (const replacedBy of Object.values(RETIRED_SKILL_SLOTS)) {
      expect(replacedBy.length).toBeGreaterThan(0);
      for (const name of replacedBy) expect(isSkillSlotName(name)).toBe(true);
    }
  });
});

describe("isSkillSlotName", () => {
  it("accepts every registered slot name", () => {
    for (const name of SKILL_SLOT_NAMES) {
      expect(isSkillSlotName(name)).toBe(true);
    }
  });

  it("rejects unknown names and non-strings", () => {
    expect(isSkillSlotName("core")).toBe(false);
    expect(isSkillSlotName("barbeat")).toBe(false);
    expect(isSkillSlotName("")).toBe(false);
    expect(isSkillSlotName(undefined)).toBe(false);
    expect(isSkillSlotName(42)).toBe(false);
  });
});
