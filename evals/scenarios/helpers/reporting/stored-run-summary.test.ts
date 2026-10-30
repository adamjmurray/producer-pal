// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import { printStoredRunSummary } from "./stored-run-summary.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "stored-run-summary-"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

async function store(
  scenarioId: string,
  model: string,
  trial: number,
  result: JsonEvalResult["result"],
): Promise<void> {
  const stored = {
    scenarioId,
    model,
    configProfileId: "default",
    trial,
    totalTrials: 3,
    result,
  };

  await writeFile(
    join(
      dir,
      `${scenarioId}--${model.replace("/", "_")}--default--trial-${trial}.json`,
    ),
    JSON.stringify(stored),
  );
}

const printed = (): string[] =>
  vi
    .mocked(console.log)
    .mock.calls.map(([line]) => stripVTControlCharacters(String(line)));

const rowFor = (name: string): string =>
  printed().find((line) => line.includes(name)) ?? "";

describe("printStoredRunSummary", () => {
  it("tallies passed trials per scenario and model, with a total", async () => {
    await store("alpha", "openai/m1", 1, "pass");
    await store("alpha", "openai/m1", 2, "fail");
    await store("alpha", "openai/m1", 3, "pass");
    await store("beta", "openai/m1", 1, "fail");
    await store("alpha", "google/m2", 1, "pass");

    expect(await printStoredRunSummary(dir)).toBe(true);

    expect(printed().find((line) => line.includes("Scenario"))).toMatch(
      /google\/m2.*openai\/m1/,
    );
    expect(rowFor("alpha")).toMatch(/1\/1\s+│ 2\/3/);
    expect(rowFor("beta")).toMatch(/—\s+│ 0\/1/);
    expect(rowFor("Total")).toMatch(/1\/1\s+│ 2\/4/);
  });

  it("leaves errored and skipped trials out of the count", async () => {
    await store("alpha", "openai/m1", 1, "pass");
    await store("alpha", "openai/m1", 2, "error");
    await store("beta", "openai/m1", 1, "skipped");

    await printStoredRunSummary(dir);

    expect(rowFor("alpha")).toMatch(/1\/1/);
    expect(rowFor("beta")).toContain("skip");
    expect(rowFor("Total")).toMatch(/1\/1/);
  });

  it("orders a scenario's trials numerically", async () => {
    for (let trial = 1; trial <= 10; trial++) {
      await store("alpha", "openai/m1", trial, trial === 10 ? "fail" : "pass");
    }

    await printStoredRunSummary(dir);

    expect(rowFor("alpha")).toContain("9/10");
  });

  it("reports an empty or missing folder", async () => {
    expect(await printStoredRunSummary(dir)).toBe(false);
    expect(await printStoredRunSummary(join(dir, "nope"))).toBe(false);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("ignores files that are not results", async () => {
    await mkdir(join(dir, "sub"));
    await writeFile(join(dir, "notes.txt"), "x");

    expect(await printStoredRunSummary(dir)).toBe(false);
  });
});
