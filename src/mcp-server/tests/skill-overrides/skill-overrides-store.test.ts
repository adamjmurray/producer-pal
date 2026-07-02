// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deleteSkillOverride,
  listSkillSlotStates,
  readSkillOverrides,
  readSkillSlotState,
  writeSkillOverride,
} from "#src/mcp-server/helpers/skill-overrides-store.ts";
import { VERSION } from "#src/shared/config.ts";
import { SKILL_SLOT_NAMES, SKILL_SLOTS } from "#src/skills/skill-slots.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

/**
 * Absolute path to a slot's override file inside the temp config dir.
 * @param name - Slot name
 * @returns Absolute file path
 */
function slotPath(name: string): string {
  return join(getDir(), "skills", `${name}.md`);
}

/**
 * Write a raw override file (bypassing the store) for a slot.
 * @param name - Slot name
 * @param contents - Raw file contents to write
 */
function writeRaw(name: string, contents: string): void {
  mkdirSync(join(getDir(), "skills"), { recursive: true });
  writeFileSync(slotPath(name), contents);
}

describe("readSkillOverrides", () => {
  it("returns no overrides when the folder is empty", () => {
    expect(readSkillOverrides()).toStrictEqual({});
  });

  it("returns only overridden slots, with frontmatter stripped and trimmed", () => {
    writeSkillOverride("core-standard", "  My core.  ");

    expect(readSkillOverrides()).toStrictEqual({ "core-standard": "My core." });
  });

  it("ignores stray files that are not registered slots", () => {
    writeRaw("not-a-slot", "should be ignored");
    writeSkillOverride("stark", "custom stark");

    expect(readSkillOverrides()).toStrictEqual({ stark: "custom stark" });
  });

  it("reads a hand-authored override that has no frontmatter", () => {
    writeRaw("abstark", "hand written, no provenance");

    expect(readSkillOverrides()).toStrictEqual({
      abstark: "hand written, no provenance",
    });
  });
});

describe("writeSkillOverride", () => {
  it("stamps fork-time provenance and returns the new state", () => {
    const state = writeSkillOverride("core-basic", "custom basic core");

    expect(state.name).toBe("core-basic");
    expect(state.override).toBe("custom basic core");
    expect(state.drifted).toBe(false);
    expect(state.provenance?.producerPalVersion).toBe(VERSION);
    expect(state.provenance?.builtInHash).toMatch(/^[\da-f]{64}$/);
  });

  it("persists frontmatter above the body on disk", () => {
    writeSkillOverride("midi-json", "custom notes");
    const raw = readFileSync(slotPath("midi-json"), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain(`producerPalVersion: ${VERSION}`);
    expect(raw).toContain("builtInHash: ");
    expect(raw.trimEnd().endsWith("custom notes")).toBe(true);
  });

  it("resets the slot (deletes the file) when given blank content", () => {
    writeSkillOverride("stark", "temporary");
    const state = writeSkillOverride("stark", "   \n  ");

    expect(state.override).toBe("");
    expect(state.provenance).toBeNull();
    expect(readSkillOverrides()).toStrictEqual({});
  });
});

describe("readSkillSlotState", () => {
  it("reports the built-in and no override for an untouched slot", () => {
    const state = readSkillSlotState("core-standard");

    expect(state.builtIn).toBe(SKILL_SLOTS["core-standard"].builtIn);
    expect(state.title).toBe(SKILL_SLOTS["core-standard"].title);
    expect(state.description).toBe(SKILL_SLOTS["core-standard"].description);
    expect(state.override).toBe("");
    expect(state.drifted).toBe(false);
    expect(state.provenance).toBeNull();
  });

  it("flags drift when the stored hash differs from the current built-in", () => {
    // Simulate an override forked from an older, since-changed built-in.
    writeRaw(
      "core-standard",
      "---\nproducerPalVersion: 0.0.1\nbuiltInHash: stalehash\n---\n\nmy fork",
    );

    const state = readSkillSlotState("core-standard");

    expect(state.override).toBe("my fork");
    expect(state.drifted).toBe(true);
    expect(state.provenance).toStrictEqual({
      producerPalVersion: "0.0.1",
      builtInHash: "stalehash",
    });
  });

  it("does not flag drift for an override forked from the current built-in", () => {
    writeSkillOverride("core-standard", "fresh fork");

    expect(readSkillSlotState("core-standard").drifted).toBe(false);
  });
});

describe("deleteSkillOverride", () => {
  it("resets a slot to the built-in and is a no-op when already absent", () => {
    writeSkillOverride("abstark", "temp");

    expect(deleteSkillOverride("abstark").override).toBe("");
    // Second delete must not throw on a missing file.
    expect(deleteSkillOverride("abstark").override).toBe("");
  });
});

describe("listSkillSlotStates", () => {
  it("returns one state per registered slot, in registry order", () => {
    const states = listSkillSlotStates();

    expect(states.map((s) => s.name)).toStrictEqual([...SKILL_SLOT_NAMES]);
  });
});
