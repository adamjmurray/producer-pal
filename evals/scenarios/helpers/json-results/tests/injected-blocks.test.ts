// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { externalizeInjectedBlocks } from "../injected-blocks.ts";
import { type JsonEvalResult, type JsonToolCall } from "../types.ts";

const SKILLS = "# Skills\nlots of text";
const NEXT_STEP = "Ask the user what they are working on.";

/**
 * A result carrying one turn whose tool calls are the ones given.
 * @param calls - Tool calls the turn made
 * @returns A result the writer would accept
 */
function resultWith(calls: JsonToolCall[]): JsonEvalResult {
  return {
    version: 1,
    runId: "2026-03-22T10-30-00Z",
    timestamp: "2026-03-22T10:30:00.000Z",
    scenarioId: "s",
    scenarioDescription: "",
    model: "local/m",
    configProfileId: "default",
    result: "pass",
    turns: [
      {
        turnIndex: 0,
        userMessage: "",
        assistantResponse: "",
        toolCalls: calls,
        durationMs: 1,
      },
    ],
    checks: { pass: true, results: [] },
    totalDurationMs: 1,
  };
}

/**
 * The blocks recorded on one of the only turn's tool calls.
 * @param result - Result to read
 * @param index - Which tool call
 * @returns Its recorded blocks, or undefined when it has none
 */
function blocksOf(result: JsonEvalResult, index: number): string[] | undefined {
  return result.turns[0]?.toolCalls[index]?.injectedBlocks;
}

describe("externalizeInjectedBlocks", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ppal-blocks-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("replaces each block with a hash and writes its text out", async () => {
    const out = await externalizeInjectedBlocks(
      resultWith([
        { name: "ppal-connect", args: {}, injectedBlocks: [SKILLS, NEXT_STEP] },
      ]),
      dir,
    );

    const [skillsHash, nextHash] = blocksOf(out, 0) ?? [];

    expect(skillsHash).toMatch(/^[0-9a-f]{16}$/);
    expect(readFileSync(join(dir, "blocks", `${skillsHash}.txt`), "utf8")).toBe(
      SKILLS,
    );
    expect(readFileSync(join(dir, "blocks", `${nextHash}.txt`), "utf8")).toBe(
      NEXT_STEP,
    );
  });

  it("stores one copy of a block two calls both received", async () => {
    const out = await externalizeInjectedBlocks(
      resultWith([
        { name: "ppal-connect", args: {}, injectedBlocks: [SKILLS] },
        { name: "ppal-connect", args: {}, injectedBlocks: [SKILLS] },
      ]),
      dir,
    );

    expect(readdirSync(join(dir, "blocks"))).toHaveLength(1);
    expect(blocksOf(out, 0)).toStrictEqual(blocksOf(out, 1));
  });

  it("leaves the caller's result alone", async () => {
    const input = resultWith([
      { name: "ppal-connect", args: {}, injectedBlocks: [SKILLS] },
    ]);

    await externalizeInjectedBlocks(input, dir);

    expect(blocksOf(input, 0)).toStrictEqual([SKILLS]);
  });

  it("passes through a call that received no blocks", async () => {
    const out = await externalizeInjectedBlocks(
      resultWith([{ name: "ppal-read-clip", args: { path: "t0/s0" } }]),
      dir,
    );

    expect(blocksOf(out, 0)).toBeUndefined();
  });

  it("writes no blocks directory when a run injected nothing", async () => {
    await externalizeInjectedBlocks(
      resultWith([{ name: "ppal-read-clip", args: {} }]),
      dir,
    );

    expect(readdirSync(dir)).toStrictEqual([]);
  });
});
