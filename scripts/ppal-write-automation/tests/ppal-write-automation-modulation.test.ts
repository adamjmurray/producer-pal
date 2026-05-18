// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { getModulationEnvelopes } from "#src/automation/als-modulation-writer.ts";
import { runModulation } from "../ppal-modulation-helpers.ts";

const SRC =
  "e2e/live-sets/mod-fixtures/mod-fixture-before Project/mod-fixture-before.als";

/**
 * Eine frische temporaere Kopie der BEFORE-Fixture anlegen.
 * @returns Pfad zur temporaeren `.als`-Kopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-mod-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

describe("runModulation", () => {
  it("write fuegt Modulation-Huellkurve ein (rc 0, verifiziert)", () => {
    const f = tmpCopy();
    const rc = runModulation([
      "write",
      "--als",
      f,
      "--track",
      "1-Operator",
      "--device-index",
      "0",
      "--param",
      "Frequency",
      "--clip",
      "ModClip",
      "--breakpoints",
      "0=-0.8,4=0.5",
      "--force",
    ]);

    expect(rc).toBe(0);
    const env = getModulationEnvelopes(readAls(f), "ModClip");

    expect(env[0]?.pointeeId).toBe("22678");
    expect(env[0]?.points).toStrictEqual([
      { time: -63072000, value: -0.8 },
      { time: 0, value: -0.8 },
      { time: 4, value: 0.5 },
    ]);
  });

  it("unbekanntes Subcommand → 1", () => {
    expect(runModulation(["bogus"])).toBe(1);
  });

  it("fehlende Flags → 1", () => {
    expect(runModulation(["write", "--als", "x", "--force"])).toBe(1);
  });
});
