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

// markDeleted() + drain() is the pair that makes a delete safe against an
// in-flight autosave. Chat and voice each grew their own copy of it, and the
// sweep's scope predicate drifted to the opposite polarity between them, so
// every shipped call site now lives in one module.

const HOME = "webui/src/lib/conversations/";
const PRIMITIVES = /\.(?:markDeleted|drain)\s*\(/;

describe("conversation delete single home", () => {
  it("should keep markDeleted/drain out of webui outside the shared module", () => {
    const violations: { file: string; reason: string }[] = [];

    // Tests are exempt: they drive the store directly to set up the races these
    // primitives exist for.
    for (const file of findSourceFiles(
      path.join(projectRoot, "webui", "src"),
      true,
    )) {
      const rel = path.relative(projectRoot, file);

      if (rel.startsWith(HOME)) {
        continue;
      }

      for (const [i, line] of fs
        .readFileSync(file, "utf8")
        .split("\n")
        .entries()) {
        if (PRIMITIVES.test(line)) {
          violations.push({
            file: `${rel}:${i + 1}`,
            reason: `${line.trim()} — delete/sweep steps belong in ${HOME}`,
          });
        }
      }
    }

    throwOnFileViolations(
      violations,
      "Found conversation delete steps outside the shared module",
      `Call runBulkDeleteSweep or deleteOneConversation from ${HOME} instead.`,
    );

    expect(violations).toHaveLength(0);
  });
});
