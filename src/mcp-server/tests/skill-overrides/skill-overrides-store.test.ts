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
import { buildSkills } from "#src/skills/build-skills.ts";
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
    expect(readSkillOverrides()).toStrictEqual({ fragments: {}, disabled: [] });
  });

  it("returns only overridden slots, with frontmatter stripped and trimmed", () => {
    writeSkillOverride("barbeat-standard", { content: "  My core.  " });

    expect(readSkillOverrides()).toStrictEqual({
      fragments: { "barbeat-standard": "My core." },
      disabled: [],
    });
  });

  it("reads every .md as a fragment, including custom names a fork can @include", () => {
    // The include model resolves arbitrary fragment names, so a user's own file
    // is surfaced (not ignored) — a forked driver can @include it. The resolver
    // only expands names the graph actually references, so unused ones are inert.
    writeRaw("my-notation", "custom fragment");
    writeSkillOverride("stark-standard", { content: "custom stark" });

    expect(readSkillOverrides().fragments).toStrictEqual({
      "my-notation": "custom fragment",
      "stark-standard": "custom stark",
    });
  });

  it("reads a hand-authored override that has no frontmatter", () => {
    writeRaw("midi-json", "hand written, no provenance");

    expect(readSkillOverrides().fragments).toStrictEqual({
      "midi-json": "hand written, no provenance",
    });
  });

  it("drops a file that has only frontmatter (empty body)", () => {
    // A file can linger with provenance frontmatter but a blank body — e.g. the
    // user cleared the text without deleting the file. It must not register an
    // override; the slot falls back to the built-in.
    writeRaw(
      "midi-json",
      "---\nproducerPalVersion: 0.0.1\nbuiltInHash: h\n---\n\n   \n",
    );

    expect(readSkillOverrides()).toStrictEqual({ fragments: {}, disabled: [] });
  });

  it("reports a switched-off slot as disabled, body or no body", () => {
    writeSkillOverride("library", { enabled: false });
    writeSkillOverride("arrangement", { content: "mine", enabled: false });

    expect(readSkillOverrides()).toStrictEqual({
      fragments: { arrangement: "mine" },
      disabled: ["arrangement", "library"],
    });
  });

  it("reads a hand-authored `enabled: false` on a nested fragment", () => {
    // The flag is frontmatter like any other, so it works on files that have no
    // editor slot at all.
    mkdirSync(join(getDir(), "skills", "drums"), { recursive: true });
    writeFileSync(
      join(getDir(), "skills", "drums", "backbeat.md"),
      "---\nenabled: false\n---\n\nboom bap",
    );

    expect(readSkillOverrides().disabled).toStrictEqual(["drums/backbeat"]);
  });

  it("surfaces a nested fragment file, keyed by its relative path", () => {
    mkdirSync(join(getDir(), "skills", "drums"), { recursive: true });
    writeFileSync(join(getDir(), "skills", "drums", "backbeat.md"), "boom bap");

    expect(readSkillOverrides().fragments).toStrictEqual({
      "drums/backbeat": "boom bap",
    });
  });

  it("lets a forked driver @include a nested fragment end to end", () => {
    // The point of nesting: a user can group their own fragments in folders and
    // pull one into a forked driver with a relative include.
    writeSkillOverride("standard", {
      content: 'HEAD\n\n@include "./drums/backbeat.md"',
    });
    mkdirSync(join(getDir(), "skills", "drums"), { recursive: true });
    writeFileSync(join(getDir(), "skills", "drums", "backbeat.md"), "BOOM BAP");

    expect(buildSkills({}, readSkillOverrides())).toBe("HEAD\n\nBOOM BAP");
  });
});

describe("writeSkillOverride", () => {
  it("stamps fork-time provenance and returns the new state", () => {
    const state = writeSkillOverride("barbeat-basic", {
      content: "custom basic core",
    });

    expect(state.name).toBe("barbeat-basic");
    expect(state.override).toBe("custom basic core");
    expect(state.enabled).toBe(true);
    expect(state.drifted).toBe(false);
    expect(state.provenance?.producerPalVersion).toBe(VERSION);
    expect(state.provenance?.builtInHash).toMatch(/^[\da-f]{64}$/);
  });

  it("persists frontmatter above the body on disk", () => {
    writeSkillOverride("midi-json", { content: "custom notes" });
    const raw = readFileSync(slotPath("midi-json"), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain(`producerPalVersion: ${VERSION}`);
    expect(raw).toContain("builtInHash: ");
    expect(raw.trimEnd().endsWith("custom notes")).toBe(true);
  });

  it("resets the slot (deletes the file) when given blank content", () => {
    writeSkillOverride("stark-standard", { content: "temporary" });
    const state = writeSkillOverride("stark-standard", { content: "   \n  " });

    expect(state.override).toBe("");
    expect(state.provenance).toBeNull();
    expect(readSkillOverrides()).toStrictEqual({ fragments: {}, disabled: [] });
  });

  it("stores a flag-only file when a slot with no override is switched off", () => {
    const state = writeSkillOverride("library", { enabled: false });

    expect(state.enabled).toBe(false);
    expect(state.override).toBe("");
    expect(readFileSync(slotPath("library"), "utf8")).toBe(
      "---\nenabled: false\n---\n\n",
    );
  });

  it("keeps the override body when the slot is switched off and back on", () => {
    writeSkillOverride("library", { content: "my library notes" });
    writeSkillOverride("library", { enabled: false });

    expect(readSkillSlotState("library").override).toBe("my library notes");

    const state = writeSkillOverride("library", { enabled: true });

    expect(state.enabled).toBe(true);
    expect(state.override).toBe("my library notes");
  });

  it("deletes the file when a switched-off slot with no body is re-enabled", () => {
    writeSkillOverride("library", { enabled: false });
    const state = writeSkillOverride("library", { enabled: true });

    expect(state.enabled).toBe(true);
    expect(readSkillOverrides()).toStrictEqual({ fragments: {}, disabled: [] });
  });

  it("does not re-fork provenance when only the flag changes", () => {
    // Re-stamping here would clear a drift flag the user has not looked at, by
    // claiming they forked the CURRENT built-in when they only flipped a switch.
    writeRaw(
      "arrangement",
      "---\nproducerPalVersion: 0.0.1\nbuiltInHash: stalehash\n---\n\nmy fork",
    );

    const state = writeSkillOverride("arrangement", { enabled: false });

    expect(state.drifted).toBe(true);
    expect(state.provenance).toStrictEqual({
      producerPalVersion: "0.0.1",
      builtInHash: "stalehash",
    });
  });

  it("keeps a hand-authored body that has no provenance to preserve", () => {
    writeRaw("arrangement", "hand written");

    const state = writeSkillOverride("arrangement", { enabled: false });

    expect(state.override).toBe("hand written");
    expect(state.provenance).toBeNull();
    expect(readFileSync(slotPath("arrangement"), "utf8")).toBe(
      "---\nenabled: false\n---\n\nhand written\n",
    );
  });
});

describe("readSkillSlotState", () => {
  it("reports the built-in and no override for an untouched slot", () => {
    const state = readSkillSlotState("barbeat-standard");

    expect(state.builtIn).toBe(SKILL_SLOTS["barbeat-standard"].builtIn);
    expect(state.title).toBe(SKILL_SLOTS["barbeat-standard"].title);
    expect(state.description).toBe(SKILL_SLOTS["barbeat-standard"].description);
    expect(state.override).toBe("");
    expect(state.enabled).toBe(true);
    expect(state.drifted).toBe(false);
    expect(state.provenance).toBeNull();
  });

  it("reports the drivers as the only slots that cannot be switched off", () => {
    expect(readSkillSlotState("standard").canDisable).toBe(false);
    expect(readSkillSlotState("basic").canDisable).toBe(false);
    expect(readSkillSlotState("library").canDisable).toBe(true);
  });

  it("flags drift when the stored hash differs from the current built-in", () => {
    // Simulate an override forked from an older, since-changed built-in.
    writeRaw(
      "barbeat-standard",
      "---\nproducerPalVersion: 0.0.1\nbuiltInHash: stalehash\n---\n\nmy fork",
    );

    const state = readSkillSlotState("barbeat-standard");

    expect(state.override).toBe("my fork");
    expect(state.drifted).toBe(true);
    expect(state.provenance).toStrictEqual({
      producerPalVersion: "0.0.1",
      builtInHash: "stalehash",
    });
  });

  it("does not flag drift for an override forked from the current built-in", () => {
    writeSkillOverride("barbeat-standard", { content: "fresh fork" });

    expect(readSkillSlotState("barbeat-standard").drifted).toBe(false);
  });

  it("reports null provenance for an override with incomplete frontmatter", () => {
    // A hand-edited override missing the builtInHash can't report drift — there
    // is no fork-time hash to compare against — so provenance is null and it is
    // never flagged as drifted.
    writeRaw(
      "barbeat-standard",
      "---\nproducerPalVersion: 0.0.1\n---\n\nhand-edited fork",
    );

    const state = readSkillSlotState("barbeat-standard");

    expect(state.override).toBe("hand-edited fork");
    expect(state.provenance).toBeNull();
    expect(state.drifted).toBe(false);
  });
});

describe("deleteSkillOverride", () => {
  it("resets a slot to the built-in and is a no-op when already absent", () => {
    writeSkillOverride("midi-json", { content: "temp" });

    expect(deleteSkillOverride("midi-json").override).toBe("");
    // Second delete must not throw on a missing file.
    expect(deleteSkillOverride("midi-json").override).toBe("");
  });

  it("leaves the on/off flag alone — the two axes are independent", () => {
    // "Reset to default" is about the BODY. A switched-off fragment that came
    // back on because its override was reset would be a surprise with nothing
    // on screen to explain it.
    writeSkillOverride("library", { content: "temp", enabled: false });

    const state = deleteSkillOverride("library");

    expect(state.override).toBe("");
    expect(state.enabled).toBe(false);
  });
});

describe("listSkillSlotStates", () => {
  it("returns one state per registered slot, in registry order", () => {
    const states = listSkillSlotStates();

    expect(states.map((s) => s.name)).toStrictEqual([...SKILL_SLOT_NAMES]);
  });
});
