// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { NOTATIONS } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { standardDriver } from "#src/skills/drivers.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";

const HEADER = "# Producer Pal Skills";

/**
 * Assemble a combination, collecting any warnings.
 *
 * @param smallModelMode - Whether to build the small-model variant
 * @returns The assembled blob and the warnings raised
 */
function assemble(smallModelMode: boolean): {
  skills: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const skills = buildSkills({ smallModelMode }, {}, (m) => warnings.push(m));

  return { skills, warnings };
}

describe("buildSkills - composition", () => {
  it("assembles header + notation head + the task fragments at standard depth", () => {
    const result = buildSkills({ notation: "barbeat" });

    expect(result.startsWith(HEADER)).toBe(true);
    expect(result).toContain("## Positions & Meter"); // bar|beat head
    expect(result).toContain("## Time & Note Values");
    expect(result).toContain("## Transforms");
    expect(result).toContain("### Transform Expressions & Functions");
    expect(result).toContain("### Generative Transforms");
    expect(result).toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
    expect(result).toContain("### Specialized Device Controls");
    expect(result).toContain("## Arrangement");
    expect(result).toContain("## Working with Ableton Live");
    expect(result).toContain("## Context & Memory");
    expect(result).toContain("## Getting Help");
  });

  it("gives every notation its own head at both depths — never a fallback", () => {
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

  it("selects the basic driver in small-model mode", () => {
    const basic = buildSkills({ notation: "barbeat", smallModelMode: true });

    expect(basic).toContain("If a tool call errors, read the message");
    expect(basic).toContain("## Add notes to an existing clip");
    // Standard-only fragments stay out of the small-model blob.
    expect(basic).not.toContain("## Devices & Instruments");
  });

  it("pulls in each depth's context fragment", () => {
    expect(buildSkills({ notation: "barbeat" })).toContain(
      "## Context & Memory", // context-standard
    );
    expect(
      buildSkills({ notation: "barbeat", smallModelMode: true }),
    ).toContain("scope:project stores facts about THIS Live Set"); // context-basic
  });

  it("defaults to bar|beat at both depths", () => {
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

  it("assembles every built-in combination without a single warning", () => {
    // The manifest names ~13 fragments by string. A typo, a rename that missed
    // the driver, or a fragment dropped from builtinFragments all surface here
    // as an unknown-fragment warning rather than a quietly shortened blob.
    for (const notation of NOTATIONS) {
      for (const smallModelMode of [false, true]) {
        const warnings: string[] = [];

        buildSkills({ notation, smallModelMode }, {}, (m) => warnings.push(m));

        expect(warnings).toStrictEqual([]);
      }
    }
  });

  it("never stacks blank lines, even where a fragment resolved to nothing", () => {
    // code-transforms is present-but-empty in a release build, so its manifest
    // line collapses rather than leaving a gap.
    for (const smallModelMode of [false, true]) {
      expect(assemble(smallModelMode).skills).not.toContain("\n\n\n");
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
      { fragments: { "barbeat-standard": "MY CUSTOM HEAD" } },
    );

    expect(result).toContain("MY CUSTOM HEAD");
    expect(result).not.toContain(barbeatStandard);
    expect(result).toContain("## Time & Note Values"); // rest still present
  });

  it("replaces the whole document when the driver slot is overridden", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          standard: `MY CUSTOM CORE\n\n@include "./{notation}-standard.md"`,
        },
      },
    );

    expect(result).toBe(`MY CUSTOM CORE\n\n${barbeatStandard}`);
  });

  it("ignores overrides for fragments the active graph never includes", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          basic: "IGNORED",
          "midi-json": "IGNORED",
          "stark-standard": "IGNORED",
        },
      },
    );

    expect(result).toBe(buildSkills({ notation: "barbeat" }));
  });

  it("shares one override across both depths for midi-json", () => {
    // The drivers ask for `midi-json-standard` / `midi-json-basic`; the alias
    // folds both onto the single `midi-json` slot the user actually edits.
    const standard = buildSkills(
      { notation: "midi-json" },
      { fragments: { "midi-json": "MJ!" } },
    );
    const basic = buildSkills(
      { notation: "midi-json", smallModelMode: true },
      { fragments: { "midi-json": "MJ!" } },
    );

    expect(standard).toContain("MJ!");
    expect(basic).toContain("MJ!");
  });

  it("overrides stark's standard and basic heads independently", () => {
    const overrides = {
      fragments: { "stark-standard": "STD HEAD", "stark-basic": "BASIC HEAD" },
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

  it("overrides the context fragment per depth, never across depths", () => {
    const overrides = {
      fragments: {
        "context-standard": "STD CONTEXT",
        "context-basic": "BASIC CONTEXT",
      },
    };
    const standard = buildSkills({ notation: "barbeat" }, overrides);
    const basic = buildSkills(
      { notation: "barbeat", smallModelMode: true },
      overrides,
    );

    expect(standard).toContain("STD CONTEXT");
    expect(standard).not.toContain("BASIC CONTEXT");
    expect(standard).not.toContain("## Context & Memory");
    expect(basic).toContain("BASIC CONTEXT");
    expect(basic).not.toContain("STD CONTEXT");
    expect(basic).toContain("## Rules"); // rest of the basic driver intact
  });

  it("warns when a stale driver override names a fragment that no longer exists", () => {
    // The silent-break hazard of renaming fragments: the override still parses,
    // and every renamed include used to vanish without a word.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      { fragments: { standard: `KEPT\n\n@include "./core-devices.md"` } },
      (message) => warnings.push(message),
    );

    expect(result).toContain("KEPT");
    expect(warnings).toStrictEqual([
      expect.stringContaining(`unknown fragment: "core-devices"`),
    ]);
  });

  it("warns about an override file keyed to a retired slot name", () => {
    // The other half of the silent-rename hazard: an orphaned override file is
    // never referenced by any include, so the resolver can't catch it.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      { fragments: { "core-devices": "MY OLD DEVICES OVERRIDE" } },
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("MY OLD DEVICES OVERRIDE");
    expect(result).toContain("## Devices & Instruments"); // built-in came back
    expect(warnings).toStrictEqual([
      expect.stringContaining(`"core-devices.md" is no longer used`),
    ]);
  });

  it("survives an override file named after an Object.prototype member", () => {
    // Override keys are FILENAMES from ~/.producer-pal/skills, so `toString.md`
    // reaches the retired-slot lookup as "toString" and a naive `map[name]`
    // finds Object.prototype.toString — a function that passes `!= null` and
    // then throws on `.join`. This runs before assembly with no try/catch above
    // it, so the crash took out the whole ppal-connect call.
    const warnings: string[] = [];

    for (const proto of ["toString", "constructor", "__proto__"]) {
      expect(() =>
        buildSkills(
          { notation: "barbeat" },
          { fragments: { [proto]: "hi" } },
          (message) => warnings.push(message),
        ),
      ).not.toThrow();
    }

    expect(warnings).toStrictEqual([]);
  });

  it("warns and refuses when an override fragment includes another fragment", () => {
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          "getting-help": `MINE\n\n@include "./my-extra.md"`,
          "my-extra": "MY EXTRA SECTION",
        },
      },
      (message) => warnings.push(message),
    );

    expect(result).toContain("MINE");
    expect(result).not.toContain("MY EXTRA SECTION");
    expect(warnings).toStrictEqual([
      expect.stringContaining("include nesting refused"),
    ]);
  });

  it("suppresses one fragment when a driver override deletes its include", () => {
    // The suppression story the carve exists for: fork the driver, delete one
    // line, and that section is gone while every section still included keeps
    // resolving the LIVE built-ins (no frozen fork).
    const directive = `@include "./devices.md"\n\n`;

    expect(standardDriver).toContain(directive); // guard: replace() below is real
    const result = buildSkills(
      { notation: "barbeat" },
      { fragments: { standard: standardDriver.replace(directive, "") } },
    );

    expect(result).not.toContain("## Devices & Instruments");
    expect(result).toContain("## Transforms");
    expect(result).toContain("## Finding Library Content");
    expect(result).toContain("## Arrangement");
    // Dropping a fragment must drop ONLY it — the nesting ban is what makes
    // "this line costs exactly this fragment" true.
    expect(result).toContain("### Specialized Device Controls");
  });

  it("warns when a kept fragment lost the fragment it needs", () => {
    // Deleting one include line is the documented way to trim skills, and this
    // is its worst case: the transforms tiers survive with their VOCABULARY
    // (swing(), ratchet(), waveforms) and no GRAMMAR, which is worse than
    // dropping all three. Every include still resolves, so only the declared
    // requirement can catch it.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          standard: standardDriver.replace(
            `@include "./transforms-core.md"\n\n`,
            "",
          ),
        },
      },
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Transforms");
    expect(result).toContain("### Generative Transforms"); // kept, and orphaned
    expect(warnings).toStrictEqual([
      expect.stringContaining(
        `"transforms-expressions" needs "transforms-core"`,
      ),
      expect.stringContaining(
        `"transforms-generative" needs "transforms-core"`,
      ),
    ]);
  });

  it("warns when specialized-devices outlives the devices guide it sits under", () => {
    const warnings: string[] = [];

    buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          standard: standardDriver.replace(`@include "./devices.md"\n\n`, ""),
        },
      },
      (message) => warnings.push(message),
    );

    expect(warnings).toStrictEqual([
      expect.stringContaining(`"specialized-devices" needs "devices"`),
    ]);
  });

  it("stays silent when a fragment is dropped together with its dependents", () => {
    // Dropping the whole transforms area is a legitimate trim, not a mistake.
    const warnings: string[] = [];
    const forked = [
      "transforms-core",
      "transforms-expressions",
      "transforms-generative",
    ].reduce(
      (driver, name) => driver.replace(`@include "./${name}.md"\n\n`, ""),
      standardDriver,
    );

    const result = buildSkills(
      { notation: "barbeat" },
      { fragments: { standard: forked } },
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Transforms");
    expect(result).toContain("## Finding Library Content");
    expect(warnings).toStrictEqual([]);
  });

  it("lets a user fork the driver: delete an include, add their own file", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      {
        fragments: {
          standard: `MY INTRO\n\n@include "./my-notation.md"`,
          "my-notation": "MY OWN NOTATION GUIDE",
        },
      },
    );

    expect(result).toBe("MY INTRO\n\nMY OWN NOTATION GUIDE");
    expect(result).not.toContain("## Time & Note Values");
  });
});

describe("buildSkills - disabled fragments", () => {
  it("drops a disabled fragment without falling back to the built-in", () => {
    // The whole reason the flag exists: an EMPTY override body means "track the
    // built-in", so suppression needs a channel of its own.
    const result = buildSkills(
      { notation: "barbeat" },
      { disabled: ["library"] },
    );

    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
  });

  it("drops a disabled fragment the user also customized", () => {
    const result = buildSkills(
      { notation: "barbeat" },
      { fragments: { library: "MY LIBRARY NOTES" }, disabled: ["library"] },
    );

    expect(result).not.toContain("MY LIBRARY NOTES");
    expect(result).not.toContain("## Finding Library Content");
  });

  it("leaves the include line valid, so nothing is reported as unknown", () => {
    // Same contract as a tool-gated fragment: present-but-empty, not missing.
    const warnings: string[] = [];

    buildSkills({ notation: "barbeat" }, { disabled: ["arrangement"] }, (m) =>
      warnings.push(m),
    );

    expect(warnings).toStrictEqual([]);
  });

  it("warns when a kept fragment's prerequisite was switched off", () => {
    // Unlike tool gating (where a dependent's gate is a subset of its
    // prerequisite's, so both go together), a user can switch off exactly the
    // grammar the surviving tiers are written against.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      { disabled: ["transforms-core"] },
      (message) => warnings.push(message),
    );

    expect(result).toContain("### Generative Transforms"); // kept, and orphaned
    expect(warnings).toStrictEqual([
      expect.stringContaining(
        `"transforms-expressions" needs "transforms-core"`,
      ),
      expect.stringContaining(
        `"transforms-generative" needs "transforms-core"`,
      ),
    ]);
  });

  it("stays silent when a fragment is switched off with its dependents", () => {
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat" },
      { disabled: ["devices", "specialized-devices"] },
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Devices & Instruments");
    expect(result).not.toContain("### Specialized Device Controls");
    expect(warnings).toStrictEqual([]);
  });

  it("resolves an aliased notation head through its canonical slot", () => {
    // The drivers ask for `midi-json-standard`; the switch is stored under the
    // one slot a user edits, so the alias has to be applied before the check.
    const result = buildSkills(
      { notation: "midi-json" },
      { disabled: ["midi-json"] },
    );

    expect(result).not.toContain("MIDI-JSON");
  });

  it("warns about a switched-off file keyed to a retired slot name", () => {
    // An orphaned file is inert whether it carries a body or only the flag.
    const warnings: string[] = [];

    buildSkills({ notation: "barbeat" }, { disabled: ["core-devices"] }, (m) =>
      warnings.push(m),
    );

    expect(warnings).toStrictEqual([
      expect.stringContaining(`"core-devices.md" is no longer used`),
    ]);
  });

  it("warns once about a slot that is both overridden and switched off", () => {
    const warnings: string[] = [];

    buildSkills(
      { notation: "barbeat" },
      { fragments: { "core-devices": "MINE" }, disabled: ["core-devices"] },
      (message) => warnings.push(message),
    );

    expect(warnings).toStrictEqual([
      expect.stringContaining(`"core-devices.md" is no longer used`),
    ]);
  });
});

describe("buildSkills - tool gating", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("ships everything when the toolset is not supplied", () => {
    expect(buildSkills({ notation: "barbeat" })).toBe(
      buildSkills({ notation: "barbeat", tools: ALL_TOOLS }),
    );
  });

  it("drops a section whose every tool is off, and says nothing about it", () => {
    // Disabling a tool is a setting, not a broken document — no warning.
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
    expect(warnings).toStrictEqual([]);
  });

  it("drops a user's override of a gated fragment too", () => {
    // The override slot is named for the fragment's subject, so a customized
    // library guide is exactly as dead as the built-in when the tool is off.
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      { fragments: { library: "MY LIBRARY NOTES" } },
    );

    expect(result).not.toContain("MY LIBRARY NOTES");
  });

  it("drops a dependent together with what it requires, never alone", () => {
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => !name.endsWith("-device")),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Devices & Instruments");
    expect(result).not.toContain("### Specialized Device Controls");
    expect(warnings).toStrictEqual([]);
  });

  it("cuts the blob down to the conversational core for a minimal toolset", () => {
    const full = buildSkills({ notation: "barbeat", tools: ALL_TOOLS });
    const minimal = buildSkills({
      notation: "barbeat",
      tools: ["ppal-connect", "ppal-playback", "ppal-select"],
    });

    expect(minimal).toContain("## Time & Note Values");
    expect(minimal).toContain("## Working with Ableton Live");
    expect(minimal).toContain("## Getting Help");
    expect(minimal).not.toContain("## Positions & Meter"); // bar|beat head
    expect(minimal).not.toContain("## Transforms");
    expect(minimal).not.toContain("## Context & Memory");
    expect(minimal.length).toBeLessThan(full.length / 2);
  });

  it("gates the small-model document the same way", () => {
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS.filter((name) => name !== "ppal-context"),
    });

    expect(result).toContain(HEADER);
    expect(result).not.toContain("## Context");
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

    const { skills, warnings } = assemble(false);

    expect(skills).not.toContain("Code Transforms");
    // Present-but-empty, not missing: the manifest line must stay silent.
    expect(warnings).toStrictEqual([]);
  });
});
