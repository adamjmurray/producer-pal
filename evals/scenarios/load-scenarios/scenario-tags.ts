// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario tags — the subset axis, alongside scenario ids and `kind`. A full
 * suite run costs hours, so most runs are a slice of it; `--tag` names a slice
 * without listing its ids by hand.
 */

/**
 * Every tag a scenario may carry. A scenario may carry more than one when it
 * genuinely grades both (e.g. a preTransforms range clear is notation AND
 * transforms). Adding a name here is what makes it usable.
 */
export const SCENARIO_TAGS = [
  "clips",
  "context",
  "devices",
  "notation",
  "pairing",
  "paths",
  "results",
  "transforms",
  "workflow",
] as const;

export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

/**
 * Parse `--tag` values into tag names. The flag repeats and each value may be a
 * comma list, so `--tag paths,clips --tag context` is three tags.
 *
 * @param values - Raw `--tag` values collected by the CLI
 * @returns Deduped tag names, in the order first seen
 * @throws When a value names no tag, or a name is not a declared tag
 */
export function parseTagArgs(values: string[]): string[] {
  const perValue = values.map((value) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );

  // An empty value would filter nothing and run the whole suite.
  if (perValue.some((names) => names.length === 0)) {
    throw new Error(
      `--tag needs a tag name. Available: ${SCENARIO_TAGS.join(", ")}`,
    );
  }

  const names = perValue.flat();
  const unknown = names.filter((name) => !isScenarioTag(name));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown tag(s): ${unknown.join(", ")}. ` +
        `Available: ${SCENARIO_TAGS.join(", ")}`,
    );
  }

  return [...new Set(names)];
}

/**
 * Whether a name is a declared scenario tag.
 *
 * @param name - The name to check
 * @returns True when the name is in `SCENARIO_TAGS`
 */
export function isScenarioTag(name: string): name is ScenarioTag {
  return (SCENARIO_TAGS as readonly string[]).includes(name);
}
