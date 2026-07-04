// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  isSkillSlotName,
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
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
