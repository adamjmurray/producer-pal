// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dropReplacedError,
  loadResumedTrials,
  type ResumedTrials,
  trialKey,
} from "./resumed-trials.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "resumed-trials-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

const store = async (file: string, fields: object): Promise<string> => {
  const path = join(dir, file);

  await writeFile(
    path,
    JSON.stringify({
      model: "openai/m",
      configProfileId: "default",
      ...fields,
    }),
  );

  return path;
};

const exists = async (path: string): Promise<boolean> =>
  await access(path).then(
    () => true,
    () => false,
  );

describe("loadResumedTrials", () => {
  it("counts finished trials as done and errored ones as to rerun", async () => {
    await store("a--1.json", { scenarioId: "a", trial: 1, result: "pass" });
    await store("a--2.json", { scenarioId: "a", trial: 2, result: "fail" });
    await store("b.json", { scenarioId: "b", result: "skipped" });
    const errored = await store("c.json", { scenarioId: "c", result: "error" });

    await writeFile(join(dir, "run.json"), JSON.stringify({ argv: [] }));
    await writeFile(join(dir, "cut-short.json"), '{"scenarioId": "d", "res');
    await mkdir(join(dir, "blocks"));

    const resumed = await loadResumedTrials(dir);

    expect([...resumed.done.keys()].toSorted()).toStrictEqual(
      [
        trialKey("a", "openai/m", "default", 1),
        trialKey("a", "openai/m", "default", 2),
        trialKey("b", "openai/m", "default", 1),
      ].toSorted(),
    );
    expect(resumed.errored).toStrictEqual(
      new Map([[trialKey("c", "openai/m", "default", 1), errored]]),
    );
  });
});

describe("dropReplacedError", () => {
  const key = trialKey("c", "openai/m", "default", 1);

  const resumedWith = (path: string): ResumedTrials => ({
    done: new Map(),
    errored: new Map([[key, path]]),
  });

  it("removes the error's file when the rerun saved under another name", async () => {
    const old = await store("c.json", { result: "error" });

    await dropReplacedError(
      resumedWith(old),
      key,
      join(dir, "c--trial-1.json"),
    );

    expect(await exists(old)).toBe(false);
  });

  it("leaves the file the rerun overwrote", async () => {
    const old = await store("c.json", { result: "error" });

    await dropReplacedError(resumedWith(old), key, old);

    expect(await exists(old)).toBe(true);
  });

  it("does nothing for a trial that hadn't errored", async () => {
    await expect(
      dropReplacedError(resumedWith("x"), "other", "y"),
    ).resolves.toBeUndefined();
  });
});
