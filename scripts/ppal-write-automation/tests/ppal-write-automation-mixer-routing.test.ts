// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { getCrossFadeAssign } from "#src/automation/als-mixer-routing.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { runMixerRouting } from "../ppal-mixer-routing-helpers.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Das echte e2e-Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-mr-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

describe("runMixerRouting", () => {
  it("crossfade set+get auf Track Drums", () => {
    const f = tmpCopy();

    expect(
      runMixerRouting([
        "crossfade",
        "--als",
        f,
        "--track",
        "Drums",
        "--value",
        "B",
        "--force",
      ]),
    ).toBe(0);
    // Drums-Block muss CrossFadeState-Manual=2 haben. Track-Block ueber den
    // kanonischen Locator extrahieren statt Index-Fenster (Track-Block ist im
    // dekomprimierten Set groesser als ein +-4000-Zeichen-Fenster um den
    // Namens-String, daher trifft die Plan-Slice-Variante den CrossFadeState
    // nicht).
    const loc = locateTrackBlock(readAls(f), "Drums");

    expect(getCrossFadeAssign(loc.block)).toBe(2);
  });

  it("send-pre set+get auf Return-Id 3", () => {
    const f = tmpCopy();

    expect(
      runMixerRouting([
        "send-pre",
        "--als",
        f,
        "--return-id",
        "3",
        "--value",
        "pre",
        "--force",
      ]),
    ).toBe(0);
    expect(readAls(f)).toContain('<SendPreBool Id="3" Value="true" />');
  });

  it("unbekanntes Subcommand → 1", () => {
    expect(runMixerRouting(["bogus"])).toBe(1);
  });

  it("fehlende Flags → 1", () => {
    // --force noetig: ohne ihn greift bei lokal offenem Set (Port 3350) der
    // Open-Set-Guard mit exit 2 BEVOR die Flag-Validierung laeuft. Mit --force
    // wird der Guard uebersprungen und die fehlende --track/--value-Pruefung
    // liefert deterministisch exit 1 (unabhaengig vom Umgebungszustand).
    expect(runMixerRouting(["crossfade", "--als", "x", "--force"])).toBe(1);
  });
});
