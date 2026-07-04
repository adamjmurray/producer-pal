// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import { SKILL_SLOT_NAMES, SKILL_SLOTS } from "#src/skills/skill-slots.ts";

describe("builtinFragments", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the driver roots with the header and their two includes", () => {
    const frags = builtinFragments(false);

    for (const [root, level] of [
      ["standard", "standard"],
      ["basic", "basic"],
    ] as const) {
      expect(frags[root]).toContain("# Producer Pal Skills");
      expect(frags[root]).toContain(`@include "./{notation}-${level}.md"`);
      expect(frags[root]).toContain(`@include "./core-${level}.md"`);
    }
  });

  it("makes the midi-json level names thin wrappers over the shared head", () => {
    const frags = builtinFragments(false);

    expect(frags["midi-json-standard"]).toBe(`@include "./midi-json.md"`);
    expect(frags["midi-json-basic"]).toBe(`@include "./midi-json.md"`);
  });

  it("gates code-transforms on the enableCodeExec flag", () => {
    expect(builtinFragments(false)["code-transforms"]).toBeUndefined();
    expect(builtinFragments(true)["code-transforms"]).toBeDefined();
  });

  it("defaults the flag to the ENABLE_CODE_EXEC env", () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");
    expect(builtinFragments()["code-transforms"]).toBeDefined();

    vi.stubEnv("ENABLE_CODE_EXEC", "");
    expect(builtinFragments()["code-transforms"]).toBeUndefined();
  });

  it("stays consistent with the editor slot registry for every curated slot", () => {
    // The editor serves SKILL_SLOTS[name].builtIn as "the current default"; the
    // resolver assembles from builtinFragments()[name]. They must be the same
    // string or the preview would diverge from what the editor shows.
    const frags = builtinFragments(true);

    for (const name of SKILL_SLOT_NAMES) {
      expect(frags[name]).toBe(SKILL_SLOTS[name].builtIn);
    }
  });
});
