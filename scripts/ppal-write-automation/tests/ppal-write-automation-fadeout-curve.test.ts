// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { getFadeOutCurve } from "#src/automation/als-fades-curve.ts";
import { locateClipWithinTrack, parseFlags } from "../clip-patch-cli.ts";
import { runFadeoutCurve } from "../ppal-fadeout-curve-helpers.ts";

const SRC_DIR = "e2e/live-sets/4c-fixtures/4c-fadeout-base Project";
const TRACK = "3-Wurli Piano Dmin";
const CLIP = "Wurli Piano Dmin";

/**
 * Kopiert das Fixture-Projekt in ein tmp-Verzeichnis fuer isolierte Writes.
 * @returns Pfad zur tmp-Kopie der `4c-fadeout-base.als`.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-foc-"));

  cpSync(SRC_DIR, join(dir, "p"), { recursive: true });

  return join(dir, "p", "4c-fadeout-base.als");
}

describe("runFadeoutCurve", () => {
  it("set up + verify (rc 0)", () => {
    const f = tmpCopy();
    const rc = runFadeoutCurve(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--key",
        "FadeOutCurve",
        "--value",
        "up",
        "--force",
      ],
      parseFlags,
    );

    expect(rc).toBe(0);
    const blk = locateClipWithinTrack(readAls(f), TRACK, CLIP).block;

    expect(getFadeOutCurve(blk)).toBe("up");
  });

  it("get gibt JSON (rc 0)", () => {
    const f = tmpCopy();

    expect(
      runFadeoutCurve(
        ["get", "--als", f, "--track", TRACK, "--clip", CLIP],
        parseFlags,
      ),
    ).toBe(0);
  });

  it("unbekanntes Subcommand → 1", () => {
    expect(runFadeoutCurve(["bogus"], parseFlags)).toBe(1);
  });
});
