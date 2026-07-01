// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { buildSkills } from "./build-skills.ts";
import { coreBasic } from "./core/core-basic.ts";
import { coreStandard } from "./core/core-standard.ts";
import { abstark } from "./notation/abstark.ts";
import { barbeatBasic } from "./notation/barbeat-basic.ts";
import { barbeatStandard } from "./notation/barbeat-standard.ts";
import { midiJson } from "./notation/midi-json.ts";
import { stark } from "./notation/stark.ts";

const HEADER = "# Producer Pal Skills";

const STANDARD_HEAD: Record<Notation, string> = {
  barbeat: barbeatStandard,
  "midi-json": midiJson,
  stark,
  abstark,
};

const BASIC_HEAD: Record<Notation, string> = {
  barbeat: barbeatBasic,
  "midi-json": midiJson,
  stark,
  abstark,
};

describe("buildSkills - composition", () => {
  it("standard = HEADER + notation head + shared standard core", () => {
    for (const notation of NOTATIONS) {
      expect(buildSkills({ notation })).toBe(
        `${HEADER}\n\n${STANDARD_HEAD[notation]}\n\n${coreStandard}`,
      );
    }
  });

  it("basic = HEADER + notation head + shared basic core", () => {
    for (const notation of NOTATIONS) {
      expect(buildSkills({ notation, smallModelMode: true })).toBe(
        `${HEADER}\n\n${BASIC_HEAD[notation]}\n\n${coreBasic}`,
      );
    }
  });

  it("defaults to bar|beat at both levels", () => {
    expect(buildSkills()).toBe(buildSkills({ notation: "barbeat" }));
    expect(buildSkills({ smallModelMode: true })).toBe(
      buildSkills({ notation: "barbeat", smallModelMode: true }),
    );
  });

  it("gives every notation its own head — never a fallback to another", () => {
    // Regression guard for the old bug where stark/abstark/midi-json silently
    // reused bar|beat's standard head. All four standard heads are distinct.
    const standardHeads = NOTATIONS.map((n) => STANDARD_HEAD[n]);

    expect(new Set(standardHeads).size).toBe(NOTATIONS.length);

    // Only bar|beat has a distinct basic head; the other three share one head
    // across both levels (their notes format has no simplified variant).
    expect(STANDARD_HEAD.barbeat).not.toBe(BASIC_HEAD.barbeat);
    expect(STANDARD_HEAD["midi-json"]).toBe(BASIC_HEAD["midi-json"]);
    expect(STANDARD_HEAD.stark).toBe(BASIC_HEAD.stark);
    expect(STANDARD_HEAD.abstark).toBe(BASIC_HEAD.abstark);
  });

  it("layers the shared core body onto every notation at both levels", () => {
    for (const notation of NOTATIONS) {
      const standard = buildSkills({ notation });

      expect(standard).toContain("## Time & Note Values"); // shared core
      expect(standard).toContain("## Devices & Instruments"); // shared core

      const basic = buildSkills({ notation, smallModelMode: true });

      expect(basic).toContain("If a tool call errors, read the message"); // coreBasic
    }
  });
});

describe("buildSkills - ENABLE_CODE_EXEC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("includes code transforms skills when ENABLE_CODE_EXEC is true", async () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "true");
    // Reset before re-importing: the static import at the top of this file
    // already evaluated core-standard.ts (which reads the env at module load),
    // so the fragment must be re-evaluated to pick up the stubbed value.
    vi.resetModules();

    const { buildSkills: build } = await import("./build-skills.ts");

    expect(build()).toContain("Code Transforms");
  });

  it("excludes code transforms skills when ENABLE_CODE_EXEC is not set", async () => {
    vi.stubEnv("ENABLE_CODE_EXEC", "");
    vi.resetModules();

    const { buildSkills: build } = await import("./build-skills.ts");

    expect(build()).not.toContain("Code Transforms");
  });
});
