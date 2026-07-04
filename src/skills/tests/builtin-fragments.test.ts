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

  it("exposes the driver roots with the header, inlined core, and notation include", () => {
    const frags = builtinFragments(false);

    for (const [root, level, coreHeading] of [
      ["standard", "standard", "## Time & Note Values"],
      ["basic", "basic", "## Add notes to an existing clip"],
    ] as const) {
      expect(frags[root]).toContain("# Producer Pal Skills");
      // Notation guide is pulled in via @include, positioned within the core.
      expect(frags[root]).toContain(`@include "./{notation}-${level}.md"`);
      // The core body is inlined, not @include'd.
      expect(frags[root]).toContain(coreHeading);
      expect(frags[root]).not.toContain(`@include "./core-${level}.md"`);
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
