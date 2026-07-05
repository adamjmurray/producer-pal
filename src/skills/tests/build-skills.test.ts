// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTATIONS } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";

const HEADER = "# Producer Pal Skills";

describe("buildSkills - composition", () => {
  it("assembles header + notation head + shared core at standard level", () => {
    const result = buildSkills({ notation: "barbeat" });

    expect(result.startsWith(HEADER)).toBe(true);
    expect(result).toContain("## Positions & Meter"); // bar|beat head
    expect(result).toContain("## Time & Note Values"); // shared core
    expect(result).toContain("## Devices & Instruments"); // shared core
  });

  it("gives every notation its own head at both levels — never a fallback", () => {
    for (const notation of NOTATIONS) {
      const standard = buildSkills({ notation });
      const basic = buildSkills({ notation, smallModelMode: true });

      expect(standard.startsWith(HEADER)).toBe(true);
      expect(basic.startsWith(HEADER)).toBe(true);
    }

    // The three standard heads are distinct blobs (regression guard for the old
    // bug where stark/midi-json silently reused bar|beat's head).
    const standards = NOTATIONS.map((n) => buildSkills({ notation: n }));

    expect(new Set(standards).size).toBe(NOTATIONS.length);
  });

  it("selects the basic core in small-model mode", () => {
    const basic = buildSkills({ notation: "barbeat", smallModelMode: true });

    expect(basic).toContain("If a tool call errors, read the message"); // coreBasic body
    expect(basic).toContain("## Add notes to an existing clip"); // basic core heading
  });

  it("defaults to bar|beat at both levels", () => {
    expect(buildSkills()).toBe(buildSkills({ notation: "barbeat" }));
    expect(buildSkills({ smallModelMode: true })).toBe(
      buildSkills({ notation: "barbeat", smallModelMode: true }),
    );
  });

  it("leaves no unresolved @include directives in the output", () => {
    for (const notation of NOTATIONS) {
      expect(buildSkills({ notation })).not.toContain("@include");
      expect(buildSkills({ notation, smallModelMode: true })).not.toContain(
        "@include",
      );
    }
  });
});

describe("buildSkills - overrides", () => {
  it("no overrides is identical to passing an empty overrides object", () => {
    expect(buildSkills({ notation: "stark" }, {})).toBe(
      buildSkills({ notation: "stark" }),
    );
  });

  it("replaces the active notation head fragment", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      { "barbeat-standard": "MY CUSTOM HEAD" },
    );

    expect(result).toContain("MY CUSTOM HEAD");
    expect(result).not.toContain(barbeatStandard);
    expect(result).toContain("## Time & Note Values"); // core still present
  });

  it("replaces the whole document when the driver slot is overridden", () => {
    // The core is inlined into the driver, so there is no separate core slot to
    // override — replacing `standard` replaces everything, and the notation
    // include embedded in the override still resolves against the built-in head.
    const result = buildSkills(
      { notation: "barbeat" },
      { standard: `MY CUSTOM CORE\n\n@include "./{notation}-standard.md"` },
    );

    expect(result).toBe(`MY CUSTOM CORE\n\n${barbeatStandard}`);
  });

  it("ignores overrides for fragments the active graph never includes", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      {
        basic: "IGNORED",
        "midi-json": "IGNORED",
        "stark-standard": "IGNORED",
      },
    );

    expect(result).toBe(buildSkills({ notation: "barbeat" }));
  });

  it("shares one override across both levels for midi-json", () => {
    const standard = buildSkills(
      { notation: "midi-json" },
      { "midi-json": "MJ!" },
    );
    const basic = buildSkills(
      { notation: "midi-json", smallModelMode: true },
      { "midi-json": "MJ!" },
    );

    expect(standard).toContain("MJ!");
    expect(basic).toContain("MJ!");
  });

  it("overrides stark's standard and basic heads independently", () => {
    const overrides = {
      "stark-standard": "STD HEAD",
      "stark-basic": "BASIC HEAD",
    };
    const standard = buildSkills({ notation: "stark" }, overrides);
    const basic = buildSkills(
      { notation: "stark", smallModelMode: true },
      overrides,
    );

    expect(standard).toContain("STD HEAD");
    expect(standard).not.toContain("BASIC HEAD");
    expect(basic).toContain("BASIC HEAD");
    expect(basic).not.toContain("STD HEAD");
  });

  it("reports assembly warnings (cycles) to onWarn while still producing output", () => {
    // A forked driver that includes itself is a cycle: the resolver drops the
    // cyclic include with a warning rather than looping. Without an onWarn sink
    // that warning is silently lost (the bug this thread fixes).
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      { standard: `INTRO\n\n@include "./standard.md"\n\nOUTRO` },
      (message) => warnings.push(message),
    );

    expect(result).toContain("INTRO");
    expect(result).toContain("OUTRO");
    expect(result).not.toContain("@include");
    expect(warnings.some((w) => w.includes("cycle"))).toBe(true);
  });

  it("lets a user fork the driver: delete an include, add their own file", () => {
    // The customization story — a forked driver drops the core include and
    // points the notation include at a fragment of the user's own.
    const result = buildSkills(
      { notation: "barbeat" },
      {
        standard: `MY INTRO\n\n@include "./my-notation.md"`,
        "my-notation": "MY OWN NOTATION GUIDE",
      },
    );

    expect(result).toBe("MY INTRO\n\nMY OWN NOTATION GUIDE");
    expect(result).not.toContain("## Time & Note Values"); // core include removed
  });
});

describe("buildSkills - ENABLE_CODE_EXEC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes code transforms skills when ENABLE_CODE_EXEC is true", () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");

    expect(buildSkills()).toContain("Code Transforms");
  });

  it("excludes code transforms skills when ENABLE_CODE_EXEC is not set", () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "");

    expect(buildSkills()).not.toContain("Code Transforms");
  });
});
