// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Eleven tool defs each spelled out the ids/paths aliases, and the two clip
// tools each spelled out the same three audio-clip params. They come from
// src/tools/shared/schema/ now, so the wording can't drift apart again.

const TOOLS_DIR = path.join(projectRoot, "src", "tools");
const ALIAS_HOME = "src/tools/shared/schema/addressing-params.ts";
const AUDIO_HOME = "src/tools/shared/schema/audio-clip-params.ts";

// The plain block addressingAliases() builds. ppal-select's trackId/sceneId/…
// carry `independent: true` and warn differently, so they don't match.
const RAW_ALIAS =
  /aliasParam\(\s*z\.coerce\.string\(\)\.optional\(\)\s*,\s*\{\s*canonical:\s*"(id|path)"\s*,?\s*\}\s*\)/g;

const AUDIO_PARAM_TEXT = [
  "audio clip gain in decibels, 0 = unity (ignored for MIDI)",
  "audio clip pitch shift in semitones, supports decimals (ignored for MIDI)",
  "audio clip warp mode (ignored for MIDI)",
];

describe("shared tool-def params", () => {
  it("builds the ids/paths aliases from one place", () => {
    const violations = scanTools(ALIAS_HOME, (source) =>
      [...source.matchAll(RAW_ALIAS)].map((match) => ({
        index: match.index,
        reason: `alias for "${match[1]}" spelled out again`,
      })),
    );

    throwOnFileViolations(
      violations,
      "Found the raw id/path alias block outside its shared builder",
      `Spread addressingAliases() from ${ALIAS_HOME} instead.`,
    );

    expect(violations).toHaveLength(0);
  });

  it("builds the audio-clip params from one place", () => {
    const violations = scanTools(AUDIO_HOME, (source) =>
      AUDIO_PARAM_TEXT.flatMap((text) => {
        const index = source.indexOf(text);

        return index === -1 ? [] : [{ index, reason: `"${text}" repeated` }];
      }),
    );

    throwOnFileViolations(
      violations,
      "Found an audio-clip param declared outside its shared builder",
      `Spread audioClipParams() from ${AUDIO_HOME} instead.`,
    );

    expect(violations).toHaveLength(0);
  });
});

/** Where a banned pattern was found in a file. */
interface Found {
  index: number;
  reason: string;
}

/**
 * Runs a scan over every non-test source file under src/tools, skipping the one
 * file the pattern belongs in.
 * @param home - Project-relative path of the shared module that owns the pattern
 * @param find - Locates the pattern in one file's source
 * @returns One violation per hit, located as file:line
 */
function scanTools(
  home: string,
  find: (source: string) => Found[],
): { file: string; reason: string }[] {
  const violations: { file: string; reason: string }[] = [];

  for (const file of findSourceFiles(TOOLS_DIR, true)) {
    const rel = path.relative(projectRoot, file);

    if (rel === home) {
      continue;
    }

    const source = fs.readFileSync(file, "utf8");

    for (const { index, reason } of find(source)) {
      const line = source.slice(0, index).split("\n").length;

      violations.push({ file: `${rel}:${line}`, reason });
    }
  }

  return violations;
}
