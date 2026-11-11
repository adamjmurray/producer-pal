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
});
