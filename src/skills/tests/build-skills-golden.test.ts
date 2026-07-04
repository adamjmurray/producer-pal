// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Byte-identical port guard. The golden fixtures were captured from the previous
// (pre-include-mechanism) buildSkills for all six notation × level combinations,
// with code execution off and on. The include-based assembly must reproduce them
// exactly — a diff here means the refactor changed the instructions the model
// receives, which is a behavior change, not a mechanical port.

import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import goldenNoCodeExec from "./golden-skills-nocodeexec.json" with { type: "json" };
import goldenCodeExec from "./golden-skills-codeexec.json" with { type: "json" };

/**
 * Fixture key for a combo, matching the capture script.
 *
 * @param notation - The notation
 * @param smallModelMode - Whether small-model (basic) skills are active
 * @returns The fixture key (e.g. "barbeat:standard")
 */
function comboKey(notation: Notation, smallModelMode: boolean): string {
  return `${notation}:${smallModelMode ? "basic" : "standard"}`;
}

describe("buildSkills - byte-identical port", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reproduces the pre-refactor output for every combo (code exec off)", () => {
    for (const notation of NOTATIONS) {
      for (const smallModelMode of [false, true]) {
        expect(buildSkills({ notation, smallModelMode })).toBe(
          (goldenNoCodeExec as Record<string, string>)[
            comboKey(notation, smallModelMode)
          ],
        );
      }
    }
  });

  it("reproduces the pre-refactor output for every combo (code exec on)", () => {
    // The gate now lives in builtinFragments()'s call-time env read, so stubbing
    // the env is enough — no module reset needed.
    vi.stubEnv("ENABLE_CODE_EXEC", "true");

    for (const notation of NOTATIONS) {
      for (const smallModelMode of [false, true]) {
        expect(buildSkills({ notation, smallModelMode })).toBe(
          (goldenCodeExec as Record<string, string>)[
            comboKey(notation, smallModelMode)
          ],
        );
      }
    }
  });
});
