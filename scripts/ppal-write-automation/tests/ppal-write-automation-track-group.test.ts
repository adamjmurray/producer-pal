// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { runTrackGroup } from "../ppal-track-group-helpers.ts";

const SET =
  "/Users/macuser/Desktop/AIbleton/producer-pal/e2e/live-sets/" +
  "e2e-test-set Project/e2e-test-set.als";

// Recon-verifiziert: Member "Child" (MidiTrack, EffectiveName eindeutig),
// GroupTrack "Parent" Id=39. Mitigation-B benutzt den GroupTrack-Block
// "Parent" als Nicht-Ziel-Track — INHALTS-verankert via EffectiveName
// extrahiert (kein stale Offset, Slice-7-Lehre).
const FOREIGN_NAME = "Parent";

/**
 * Den Nicht-Ziel-Track-Block (GroupTrack "Parent") inhalts-verankert
 * extrahieren: vom `<EffectiveName Value="Parent" />` zum umschliessenden
 * `<GroupTrack `-Open-Tag zurueck, bis zum passenden `</GroupTrack>`.
 * Bewusst NICHT offset-basiert, damit ein Off-Target-Splice am Member
 * (der den Parent-Block verschieben/zerschneiden wuerde) sofort als
 * Byte-Diff im so extrahierten Fremd-Block auffaellt.
 * @param xml - Dekomprimierter .als-XML-String.
 * @returns Der GroupTrack-Block "Parent" als Substring.
 */
function foreignBlock(xml: string): string {
  const nameIdx = xml.indexOf('<EffectiveName Value="' + FOREIGN_NAME + '" />');
  const open = xml.lastIndexOf("<GroupTrack ", nameIdx);
  const closeTag = "</GroupTrack>";
  const close = xml.indexOf(closeTag, nameIdx) + closeTag.length;

  return xml.slice(open, close);
}

describe("CLI track-group", () => {
  it("set --group -1 entgruppiert byte-treu + Mitigation-B", () => {
    const dir = mkdtempSync(join(tmpdir(), "ppal-tg-"));
    const tmp = join(dir, "s.als");

    copyFileSync(SET, tmp);

    try {
      const before = readAls(tmp);
      const foreignBefore = foreignBlock(before);
      const code = runTrackGroup([
        "set",
        "--als",
        tmp,
        "--track",
        "Child",
        "--group",
        "-1",
        "--force",
      ]);

      expect(code).toBe(0);
      const after = readAls(tmp);

      expect(after).toContain('<TrackGroupId Value="-1" />');
      // Mitigation-B: Fremd-Track (GroupTrack "Parent") byte-identisch
      // vor/nach — inhalts-verankert extrahiert, kein stale Offset.
      expect(foreignBlock(after)).toBe(foreignBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("set --group 999 (nicht vorhanden) → 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "ppal-tg2-"));
    const tmp = join(dir, "s.als");

    copyFileSync(SET, tmp);

    try {
      expect(
        runTrackGroup([
          "set",
          "--als",
          tmp,
          "--track",
          "Child",
          "--group",
          "999",
          "--force",
        ]),
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("unbekanntes Subcommand → 1", () => {
    expect(runTrackGroup(["bogus"])).toBe(1);
  });
});
