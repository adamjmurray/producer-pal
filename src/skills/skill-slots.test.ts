// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { NOTATIONS } from "#src/shared/notation.ts";
import {
  activeSkillSlots,
  isSkillSlotName,
  SKILL_SLOT_NAMES,
  SKILL_SLOTS,
} from "./skill-slots.ts";

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

describe("activeSkillSlots", () => {
  it("selects the standard core + bar|beat standard head by default", () => {
    expect(activeSkillSlots("barbeat", false)).toStrictEqual({
      head: "barbeat-standard",
      core: "core-standard",
    });
  });

  it("selects the basic core + bar|beat basic head in small-model mode", () => {
    expect(activeSkillSlots("barbeat", true)).toStrictEqual({
      head: "barbeat-basic",
      core: "core-basic",
    });
  });

  it("uses the notation name as the head slot for midi-json (one head, both levels)", () => {
    expect(activeSkillSlots("midi-json", false).head).toBe("midi-json");
    expect(activeSkillSlots("midi-json", true).head).toBe("midi-json");
  });

  it("forks the stark head by level, like bar|beat", () => {
    expect(activeSkillSlots("stark", false).head).toBe("stark-standard");
    expect(activeSkillSlots("stark", true).head).toBe("stark-basic");
  });

  it("only ever resolves to registered slot names, for every notation", () => {
    for (const notation of NOTATIONS) {
      for (const small of [false, true]) {
        const { head, core } = activeSkillSlots(notation, small);

        expect(SKILL_SLOT_NAMES).toContain(head);
        expect(SKILL_SLOT_NAMES).toContain(core);
      }
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
