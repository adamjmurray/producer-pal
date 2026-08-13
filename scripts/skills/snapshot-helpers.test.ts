// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareCorpora,
  formatChanges,
  parseArgs,
} from "./snapshot-helpers.ts";

const DEFAULT_DIR = "/repo/dev/skills-snapshots";

describe("parseArgs", () => {
  it("defaults the output directory and asks for no comparison", () => {
    expect(parseArgs([], DEFAULT_DIR)).toStrictEqual({
      outDir: DEFAULT_DIR,
      diffDir: null,
    });
  });

  it("resolves both directories against the invocation directory", () => {
    const args = parseArgs(["--out", "a", "--diff", "b"], DEFAULT_DIR);

    expect(args.outDir).toBe(path.resolve("a"));
    expect(args.diffDir).toBe(path.resolve("b"));
  });

  it("rejects --flag=value, which would silently write to the default", () => {
    // The default output directory is ERASED before writing, so falling back to
    // it on a typo is how a user loses the baseline they meant to keep.
    expect(() => parseArgs(["--out=/tmp/x"], DEFAULT_DIR)).toThrow(
      /unknown argument/,
    );
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--check"], DEFAULT_DIR)).toThrow(
      /unknown argument "--check"/,
    );
  });

  it("rejects a flag with no value, or with another flag as its value", () => {
    expect(() => parseArgs(["--diff"], DEFAULT_DIR)).toThrow(
      /--diff needs a directory/,
    );
    expect(() => parseArgs(["--diff", "--out", "x"], DEFAULT_DIR)).toThrow(
      /--diff needs a directory/,
    );
  });

  it("refuses to diff against the directory it is about to erase", () => {
    // Otherwise: delete the baseline, regenerate it, diff it against itself, and
    // report "No blob changed" — a confident false negative.
    expect(() => parseArgs(["--diff", DEFAULT_DIR], DEFAULT_DIR)).toThrow(
      /would erase it/,
    );
    expect(() =>
      parseArgs(["--out", "same", "--diff", "same"], DEFAULT_DIR),
    ).toThrow(/would erase it/);
  });
});

describe("compareCorpora", () => {
  it("finds no change between identical corpora", () => {
    const corpus = new Map([["a.md", "x"]]);

    expect(compareCorpora(corpus, new Map(corpus))).toStrictEqual([]);
  });

  it("catches an edit that keeps the length", () => {
    // A renamed heading or a reordered list is exactly what a re-carve produces;
    // comparing sizes alone would call this "no change".
    const changes = compareCorpora(
      new Map([["a.md", "Producer Pal"]]),
      new Map([["a.md", "PRODUCER PAL"]]),
    );

    expect(changes).toStrictEqual([
      { kind: "changed", file: "a.md", was: 12, now: 12 },
    ]);
  });

  it("reports added and removed files", () => {
    const changes = compareCorpora(
      new Map([["gone.md", "x"]]),
      new Map([["new.md", "yy"]]),
    );

    expect(changes).toStrictEqual([
      { kind: "added", file: "new.md", now: 2 },
      { kind: "removed", file: "gone.md" },
    ]);
  });
});

describe("formatChanges", () => {
  it("says so when nothing changed", () => {
    expect(formatChanges([])).toBe("No blob changed.");
  });

  it("shows a signed delta, and names a same-size edit as one", () => {
    const lines = formatChanges([
      { kind: "changed", file: "grew.md", was: 100, now: 113 },
      { kind: "changed", file: "shrank.md", was: 100, now: 90 },
      { kind: "changed", file: "moved.md", was: 100, now: 100 },
      { kind: "added", file: "new.md", now: 5 },
      { kind: "removed", file: "gone.md" },
    ]).split("\n");

    expect(lines).toStrictEqual([
      "  ~ grew.md 100 → 113 (+13)",
      "  ~ shrank.md 100 → 90 (-10)",
      "  ~ moved.md (same size, different text)",
      "  + new.md (5)",
      "  - gone.md",
    ]);
  });
});
