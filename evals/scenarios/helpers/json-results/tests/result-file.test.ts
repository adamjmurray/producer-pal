// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isResultFile, readResultFile } from "../result-file.ts";

describe("result-file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "result-file-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /**
   * Save text as a result file and read it back
   *
   * @param text - File contents
   * @returns What `readResultFile` makes of it
   */
  async function read(text: string): Promise<unknown> {
    const path = join(dir, "result.json");

    await writeFile(path, text);

    return await readResultFile(path);
  }

  it("tells result files from the run record", () => {
    expect(isResultFile("trial-1.json")).toBe(true);
    expect(isResultFile("run.json")).toBe(false);
    expect(isResultFile("notes.txt")).toBe(false);
  });

  it("reads a file cut short as undefined", async () => {
    expect(await read('{"scenarioId": "a')).toBeUndefined();
  });

  it("reads a whole file", async () => {
    expect(await read('{"scenarioId": "a"}')).toStrictEqual({
      scenarioId: "a",
    });
  });

  it("brings a record saved with the old jev names up to date", async () => {
    const outcome = { score: 2.8, level: "complete success", confidence: 0.9 };
    const oldJudge = {
      pass: true,
      issues: [],
      provider: "jev",
      model: "jev-1.14.0",
      decidedBy: "jev",
      jev: {
        route: "openrouter",
        verdict: "pass",
        model: "jev-1.14.0",
        outcome,
      },
    };

    expect(await read(JSON.stringify({ judge: oldJudge }))).toStrictEqual({
      judge: {
        pass: true,
        issues: [],
        provider: "openrouter",
        model: "jev-1.14.0",
        decidedBy: "decider",
        decider: {
          provider: "openrouter",
          verdict: "pass",
          model: "jev-1.14.0",
          outcome: { ...outcome, maxScore: 3 },
        },
      },
    });
  });

  it("reads a legacy jev provider with no answer as TypeSafe", async () => {
    const text = JSON.stringify({
      judge: { pass: true, issues: [], provider: "decider", decidedBy: "jev" },
    });

    expect(await read(text)).toStrictEqual({
      judge: {
        pass: true,
        issues: [],
        provider: "typesafe",
        decidedBy: "decider",
      },
    });
  });

  it("keeps a new record as it is, scale included", async () => {
    const judge = {
      pass: true,
      issues: [],
      provider: "ollama",
      model: "autotrust-jev",
      decidedBy: "decider",
      decider: {
        provider: "ollama",
        verdict: "pass",
        model: "autotrust-jev",
        outcome: { score: 4, maxScore: 5, level: "x", confidence: 1 },
      },
    };

    expect(await read(JSON.stringify({ judge }))).toStrictEqual({ judge });
  });

  it("keeps an LLM judge's verdict, and moves a jev answer beside it", async () => {
    const answer = { provider: "typesafe", verdict: "escalate" };
    const judge = { pass: false, issues: [], provider: "x", decidedBy: "llm" };
    const text = (extra: object): string =>
      JSON.stringify({ judge: { ...judge, ...extra } });

    expect(await read(text({ decider: answer }))).toStrictEqual({
      judge: { ...judge, decider: answer },
    });
    expect(
      await read(text({ jev: { route: "typesafe", verdict: "escalate" } })),
    ).toStrictEqual({ judge: { ...judge, decider: answer } });
  });

  it("reads a result with no judge, or none at all", async () => {
    expect(await read("null")).toBeNull();
    expect(await read('{"judge": {"pass": true, "issues": []}}')).toStrictEqual(
      { judge: { pass: true, issues: [] } },
    );
  });
});
