// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTempoEnvelopeEvents } from "#src/automation/als-tempo-automation.ts";
import { runTempo } from "../ppal-tempo-helpers.ts";

const BEFORE_ALS =
  "/Users/macuser/Desktop/AIbleton/producer-pal/evals/live-sets/" +
  "basic-midi-4-track Project/basic-midi-4-track.als";

/**
 * Copy the real test set into a fresh tmp dir so the e2e write never
 * mutates the committed fixture.
 * @returns Absolute path of the throwaway `.als` copy.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-tempo-"));
  const dst = join(dir, "basic-midi-4-track.als");

  copyFileSync(BEFORE_ALS, dst);

  return dst;
}

describe("CLI tempo list", () => {
  it("prints the resolved Master-Tempo-AutomationTarget-Id (8)", () => {
    const out: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((s: string) => {
      out.push(String(s));

      return true;
    }) as typeof process.stdout.write;

    let code: number;

    try {
      code = runTempo(["list", "--als", BEFORE_ALS]);
    } finally {
      process.stdout.write = orig;
    }

    expect(code).toBe(0);
    expect(out.join("")).toContain("8");
  });
});

describe("CLI tempo write", () => {
  it("writes linear tempo breakpoints into a copy and re-parse-verifies", () => {
    const tmp = tmpCopy();

    try {
      const before = readAls(tmp);
      const code = runTempo([
        "write",
        "--als",
        tmp,
        "--breakpoints",
        "1=120,5=140,9=100",
        "--force",
      ]);

      expect(code).toBe(0);

      const after = readAls(tmp);
      const { block } = locateTempoEnvelopeEvents(after);
      const floatEvents = [...block.matchAll(/<FloatEvent /g)].length;

      // Anchor (Id=0) + 3 user breakpoints.
      expect(floatEvents).toBe(4);
      expect(block).toContain('Time="-63072000"');
      expect(block).toContain('Value="140"');

      // Mitigation-B: everything outside the replaced <Events> block of the
      // Tempo-Envelope is byte-identical, so a foreign (regular) track block
      // is provably untouched.
      const locBefore = locateTempoEnvelopeEvents(before);
      const locAfter = locateTempoEnvelopeEvents(after);

      expect(before.slice(0, locBefore.start)).toBe(
        after.slice(0, locAfter.start),
      );
      expect(before.slice(locBefore.end)).toBe(after.slice(locAfter.end));

      // Explicit foreign-track proof: the first regular MidiTrack block is
      // byte-identical before/after the write.
      const ms = before.indexOf("<MidiTrack ");
      const me =
        before.indexOf("</MidiTrack>", ms) + "</MidiTrack>".length;

      expect(ms).toBeGreaterThan(-1);
      expect(after.indexOf("<MidiTrack ")).toBe(ms);
      expect(after.slice(ms, me)).toBe(before.slice(ms, me));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
