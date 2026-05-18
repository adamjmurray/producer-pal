// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { runClipFlags } from "../ppal-clip-flags-helpers.ts";

const SET =
  "/Users/macuser/Desktop/AIbleton/producer-pal/e2e/live-sets/" +
  "e2e-test-set Project/e2e-test-set.als";

// Realer AudioClip aus e2e-test-set (per node/gunzip ermittelt, NICHT geraten):
// Track "Audio 1" enthaelt AudioClip "sample" (HiQ=true) und "kick".
const TRACK = "Audio 1";
const CLIP = "sample";

/**
 * Zweiten AudioClip-Block ("kick") inhalts-verankert aus dem XML extrahieren
 * (NICHT per stale before-Offset — after ist nach HiQ true→false 1 Byte
 * länger, ein eingefrorener Offset würde off-by-one slicen).
 * @param xml - Roh-.als-XML
 * @returns Der zweite AudioClip-Block
 */
function secondAudioClip(xml: string): string {
  const i = xml.indexOf("<AudioClip ", xml.indexOf("<AudioClip ") + 1);
  const e = xml.indexOf("</AudioClip>", i) + "</AudioClip>".length;

  return xml.slice(i, e);
}

describe("CLI clip-flags", () => {
  it("set HiQ false byte-treu + Mitigation-B Fremd-Clip", () => {
    const dir = mkdtempSync(join(tmpdir(), "ppal-cf-"));
    const tmp = join(dir, "s.als");

    copyFileSync(SET, tmp);

    try {
      const before = readAls(tmp);
      const code = runClipFlags([
        "set",
        "--als",
        tmp,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--flag",
        "HiQ",
        "--value",
        "false",
        "--force",
      ]);

      expect(code).toBe(0);

      const after = readAls(tmp);

      expect(after).toContain('<HiQ Value="false" />');
      // Mitigation-B: der zweite AudioClip-Block ("kick") muss byte-identisch
      // bleiben (kein Off-Target durch den Offset-Splice).
      expect(secondAudioClip(after)).toBe(secondAudioClip(before));
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(`${tmp}.bak`, { force: true });
    }
  });

  it("unbekanntes Subcommand → 1", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      expect(runClipFlags(["bogus"])).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
