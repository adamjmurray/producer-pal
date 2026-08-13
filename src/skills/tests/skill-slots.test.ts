// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  isDisableableSkillSlot,
  isSkillSlotName,
  RETIRED_SKILL_SLOTS,
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

describe("isDisableableSkillSlot", () => {
  it("marks the driver roots always-on and every section switchable", () => {
    // The drivers are the document being assembled; switching one off resolves
    // the root to "" and empties the whole blob.
    const alwaysOn = SKILL_SLOT_NAMES.filter(
      (name) => !isDisableableSkillSlot(name),
    );

    expect(alwaysOn).toStrictEqual(["standard", "basic"]);
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
