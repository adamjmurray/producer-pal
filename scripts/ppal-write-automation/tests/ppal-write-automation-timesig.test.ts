// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTimeSigEnvelopeEvents } from "#src/automation/master-timeline/als-timesig-automation.ts";
import { runTimesig } from "../ppal-timesig-helpers.ts";

const BEFORE =
  "/Users/macuser/Desktop/AIbleton/producer-pal/evals/live-sets/" +
  "basic-midi-4-track Project/basic-midi-4-track.als";

/**
 * Copy the real test set into a fresh tmp dir so the e2e write never
 * mutates the committed fixture.
 * @returns Absolute path of the throwaway `.als` copy.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-timesig-"));
  const dst = join(dir, "s.als");

  copyFileSync(BEFORE, dst);

  return dst;
}

describe("CLI timesig", () => {
  it("list druckt die TimeSignature-Target-Id 10", () => {
    const out: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((s: string) => {
      out.push(String(s));

      return true;
    }) as typeof process.stdout.write;
    let code: number;

    try {
      code = runTimesig(["list", "--als", BEFORE]);
    } finally {
      process.stdout.write = orig;
    }

    expect(code).toBe(0);
    expect(out.join("")).toContain("10");
  });

  it("write injiziert Marker + Mitigation-B Fremd-Track byte-identisch", () => {
    const tmp = tmpCopy();

    try {
      const before = readAls(tmp);
      const code = runTimesig([
        "write",
        "--als",
        tmp,
        "--breakpoints",
        "1=201,5=193,9=201",
        "--force",
      ]);

      expect(code).toBe(0);
      const after = readAls(tmp);
      const { block } = locateTimeSigEnvelopeEvents(after);

      expect([...block.matchAll(/<EnumEvent /g)]).toHaveLength(4);
      const ms = before.indexOf("<MidiTrack ");
      const me = before.indexOf("</MidiTrack>", ms) + "</MidiTrack>".length;

      expect(after.slice(ms, me)).toBe(before.slice(ms, me));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("unbekanntes Subcommand → 1", () => {
    expect(runTimesig(["bogus"])).toBe(1);
  });

  it("write ohne --breakpoints → 1", () => {
    expect(runTimesig(["write", "--als", BEFORE])).toBe(1);
  });
});
