// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

const decisionsDir = path.join(projectRoot, "dev/decisions");
const readmePath = path.join(decisionsDir, "README.md");

// dev/decisions/README.md says these numbers were retired on purpose (ADR-0001,
// ADR-0002 and ADR-0028 were removed with the user's OK) and won't get a row.
const RETIRED_NUMBERS = new Set(["0001", "0002", "0028"]);

describe("ADR decisions index", () => {
  it("has a row for every ADR file, and every row points at a real file", () => {
    const adrFiles = fs
      .readdirSync(decisionsDir)
      .filter((name) => name !== "README.md" && name.endsWith(".md"));
    const adrNumbers = new Set(
      adrFiles.map((name) => name.slice(0, 4)).filter((n) => /^\d{4}$/.test(n)),
    );
    const readme = fs.readFileSync(readmePath, "utf8");
    const rowLinks = [...readme.matchAll(/\[(\d{4})\]\(([^)]+)\)/g)];
    const indexedNumbers = new Set(rowLinks.map(([, number]) => number));

    const missingRows = [...adrNumbers]
      .filter((number) => !indexedNumbers.has(number))
      .map((number) => `dev/decisions/${number}-*.md has no index row`);

    const badTargets = rowLinks
      .filter(
        ([, , target = ""]) => !fs.existsSync(path.join(decisionsDir, target)),
      )
      .map(
        ([, number, target]) => `[${number}](${target}) target does not exist`,
      );

    const mismatchedNumbers = rowLinks
      .filter(
        ([, number = "", target = ""]) => !target.startsWith(`${number}-`),
      )
      .map(
        ([, number, target]) =>
          `[${number}](${target}) link does not start with "${number}-"`,
      );

    const staleRetired = [...RETIRED_NUMBERS].filter((number) =>
      adrNumbers.has(number),
    );

    expect(
      staleRetired,
      "Numbers listed as retired now have a file on disk; update RETIRED_NUMBERS",
    ).toStrictEqual([]);

    expect(
      [...missingRows, ...badTargets, ...mismatchedNumbers],
      "dev/decisions/README.md index is out of sync with dev/decisions/*.md",
    ).toStrictEqual([]);
  });
});
