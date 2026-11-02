// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readRunRecord } from "./run-record.ts";
import { startRunFolder } from "./run-folder.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "run-folder-"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

describe("startRunFolder", () => {
  it("records a new run under its folder, loading nothing", async () => {
    const resumed = await startRunFolder(
      "run-1",
      {},
      ["-a"],
      { all: true },
      dir,
    );

    expect(resumed).toBeUndefined();
    expect(await readRunRecord(join(dir, "run-1"))).toStrictEqual({
      argv: ["-a"],
      options: { all: true },
    });
  });

  it("writes nothing with --no-save", async () => {
    await startRunFolder("run-1", { save: false }, [], {}, dir);

    await expect(access(join(dir, "run-1"))).rejects.toThrow("ENOENT");
  });

  it("loads the trials a resume already has", async () => {
    await mkdir(join(dir, "run-1"));
    await writeFile(
      join(dir, "run-1", "a.json"),
      JSON.stringify({ scenarioId: "a", model: "m", result: "pass" }),
    );

    const resumed = await startRunFolder(
      "run-1",
      { resume: "run-1" },
      ["-a"],
      {},
      dir,
    );

    expect(resumed?.done.size).toBe(1);
    expect(vi.mocked(console.log).mock.calls.join("")).toContain(
      "Resuming run-1: 1 trial(s) already done",
    );
  });
});
