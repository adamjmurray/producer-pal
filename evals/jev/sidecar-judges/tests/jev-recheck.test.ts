// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRecheckArgs, runRecheck } from "../jev-recheck.ts";

describe("parseRecheckArgs", () => {
  it("needs a run", () => {
    expect(() => parseRecheckArgs([])).toThrow("Give the run directory");
  });

  it("defaults to Luna and the standard results directory", () => {
    const args = parseRecheckArgs(["run-1"]);

    expect(args).toStrictEqual({
      runIds: ["run-1"],
      judges: ["codex-code/luna"],
      resultsDir: "evals/results",
      dryRun: false,
    });
  });

  it("takes the results directory from a run directory path", () => {
    const args = parseRecheckArgs(["/data/results/run-1/"]);

    expect(args.runIds).toStrictEqual(["run-1"]);
    expect(args.resultsDir).toBe(resolve("/data/results"));
  });

  it("reads judges, an explicit results directory and --dry-run", () => {
    const args = parseRecheckArgs([
      "/a/run-1",
      "--judges=codex-code/luna, anthropic/claude-haiku-5-5,",
      "--results-dir=/b",
      "--dry-run",
    ]);

    expect(args.judges).toStrictEqual([
      "codex-code/luna",
      "anthropic/claude-haiku-5-5",
    ]);
    expect(args.resultsDir).toBe("/b");
    expect(args.dryRun).toBe(true);
  });

  it("falls back to Luna for an empty judges list", () => {
    expect(parseRecheckArgs(["r", "--judges=,"]).judges).toStrictEqual([
      "codex-code/luna",
    ]);
  });
});

describe("runRecheck", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-recheck-"));
    await mkdir(join(dir, "run1", "judges", "claude-code_sonnet"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("re-judges with each judge, then compares against every judge folder", async () => {
    const log = vi.fn();

    await runRecheck(
      [
        join(dir, "run1"),
        "--judges=codex-code/luna,anthropic/claude-haiku-5-5",
      ],
      {
        rejudge: {
          log,
          load: { scenarios: [], criteriaDate: () => undefined },
        },
        compare: {
          log,
          load: { scenarios: [], criteriaDate: () => undefined },
        },
      },
    );

    const out = log.mock.calls.flat().join("\n");

    expect(out).toContain("Loaded 0 result(s)");
    expect(out).toContain("Reading the recorded Jev answer of 0 of 0");
    expect(out).toContain(
      "LLM judges: codex-code_luna, anthropic_claude-haiku-5-5, claude-code_sonnet",
    );
  });

  it("makes no judge calls and no report with --dry-run", async () => {
    const log = vi.fn();

    await runRecheck([join(dir, "run1"), "--dry-run"], {
      rejudge: { log, load: { scenarios: [], criteriaDate: () => undefined } },
      compare: { log },
    });

    const out = log.mock.calls.flat().join("\n");

    expect(out).toContain("0 to judge now");
    expect(out).not.toContain("recorded Jev answer");
  });

  it("copes with a run that has no judges folder", async () => {
    const log = vi.fn();

    await mkdir(join(dir, "run2"));
    await runRecheck([join(dir, "run2")], {
      rejudge: { log, load: { scenarios: [], criteriaDate: () => undefined } },
      compare: { log, load: { scenarios: [], criteriaDate: () => undefined } },
    });

    expect(log.mock.calls.flat().join("\n")).toContain("recorded Jev answer");
  });
});
