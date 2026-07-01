// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSkills } from "./build-skills.ts";
import { barbeatBasic } from "./notation/barbeat-basic.ts";
import { starkBasic } from "./notation/stark-basic.ts";

describe("buildSkills - selection", () => {
  it("assembles bar|beat notation head + shared core at standard level", () => {
    const s = buildSkills();

    expect(s.startsWith("# Producer Pal Skills")).toBe(true);
    expect(s).toContain("## Time & Note Values"); // bar|beat notation head
    expect(s).toContain("## Devices & Instruments"); // shared core body
  });

  it("returns the notation's basic doc in small-model mode", () => {
    // Default notation is bar|beat, so small-model mode restores bar|beat basic.
    expect(buildSkills({ smallModelMode: true })).toBe(barbeatBasic);
    expect(buildSkills({ notation: "barbeat", smallModelMode: true })).toBe(
      barbeatBasic,
    );
    expect(buildSkills({ notation: "stark", smallModelMode: true })).toBe(
      starkBasic,
    );
  });

  it("falls back to the per-level default for notations not yet authored", () => {
    // Standard: unauthored notation heads fall back to bar|beat standard.
    expect(buildSkills({ notation: "abstark" })).toBe(
      buildSkills({ notation: "barbeat" }),
    );
    expect(buildSkills({ notation: "midi-json" })).toBe(buildSkills());
    // Basic: unauthored notations fall back to Stark (today's basic default).
    expect(buildSkills({ notation: "abstark", smallModelMode: true })).toBe(
      starkBasic,
    );
    expect(buildSkills({ notation: "midi-json", smallModelMode: true })).toBe(
      starkBasic,
    );
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
