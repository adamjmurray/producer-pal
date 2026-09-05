// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  buildSkills,
  type BuildSkillsOptions,
  type SkillOverrides,
} from "#src/skills/build-skills.ts";

/**
 * Build a skills blob and collect the warnings assembly raised.
 *
 * @param options - Runtime context (notation, small-model mode, toolset)
 * @param overrides - Per-fragment user overrides
 * @returns The assembled blob and the warnings, in the order raised
 */
export function buildWithWarnings(
  options: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
): { result: string; warnings: string[] } {
  const warnings: string[] = [];
  const result = buildSkills(options, overrides, (message) =>
    warnings.push(message),
  );

  return { result, warnings };
}
