// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { globSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const WORKFLOW_DIR = ".github/workflows";

// Matches: uses: owner/repo@<40-hex-char-sha>
// eslint-disable-next-line unicorn/better-regex -- [0-9a-f] is clearer for hex than [\da-f]
const SHA_PINNED = /uses:\s+[\w-]+\/[\w.-]+@[0-9a-f]{40}\b/;

// Matches any `uses:` line (ignoring local actions like ./)
const USES_LINE = /^\s*-?\s*uses:\s+(?!\.\/)([\w-]+\/[\w.-]+@\S+)/;

describe("GitHub Actions pinned to commit SHAs", () => {
  const workflowFiles = globSync(`${WORKFLOW_DIR}/*.yml`);

  it("should find workflow files", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  for (const file of workflowFiles) {
    it(`${file} should pin all actions to commit SHAs`, () => {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        const match = USES_LINE.exec(line);

        if (match && !SHA_PINNED.test(line)) {
          violations.push(`Line ${i + 1}: ${match[1]}`);
        }
      }

      expect(
        violations,
        "Actions must use commit SHA (not tag/branch)",
      ).toStrictEqual([]);
    });
  }
});
