// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isResultFile,
  RUN_RECORD_FILE,
} from "../../json-results/result-file.ts";
import { readRunRecord, writeRunRecord } from "./run-record.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "run-record-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

describe("run record", () => {
  it("reads back what was written, creating the folder", async () => {
    const runDir = join(dir, "run-1");
    const record = { argv: ["-t", "a b"], options: { repeat: "3" } };

    await writeRunRecord(runDir, record);

    expect(await readRunRecord(runDir)).toStrictEqual(record);
  });

  it("explains a missing record", async () => {
    await expect(readRunRecord(join(dir, "nope"))).rejects.toThrow(
      /No run\.json in .*nope: the run doesn't exist, predates --resume, or used --no-save/,
    );
  });
});

describe("isResultFile", () => {
  it("takes result JSON and skips the run record and other files", () => {
    expect(isResultFile("a--openai_m--default.json")).toBe(true);
    expect(isResultFile(RUN_RECORD_FILE)).toBe(false);
    expect(isResultFile("blocks")).toBe(false);
  });
});
