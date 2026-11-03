// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeRunRecord } from "./run-record.ts";
import { resumeOptions } from "./resume-options.ts";

interface Options {
  model: string[];
  resume?: string;
  repeat?: string;
  quiet?: boolean;
  usage?: boolean;
  save?: boolean;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "resume-options-"));
  await writeRunRecord(join(dir, "run-1"), {
    argv: ["-m", "openai/m", "-r", "2", "-q"],
    options: { model: ["openai/m"], repeat: "2", quiet: true, save: true },
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true });
});

/**
 * Parse a command line the way the eval CLI does.
 *
 * @param args - Command-line arguments
 * @returns The parsed command and its options
 */
function parse(args: string[]): { command: Command; options: Options } {
  const command = new Command()
    .exitOverride()
    .option("-m, --model <m>", "", (v: string, p: string[]) => [...p, v], [])
    .option("--resume <runId>")
    .option("-r, --repeat <N>")
    .option("-q, --quiet")
    .option("-u, --usage")
    .option("--no-save")
    .parse(args, { from: "user" });

  return { command, options: command.opts<Options>() };
}

const resume = async (args: string[]): ReturnType<typeof resumeOptions> => {
  const { command, options } = parse(args);

  return await resumeOptions(command, options, dir);
};

describe("resumeOptions", () => {
  it("passes a run that isn't resuming through, with its command line", async () => {
    const { command, options } = parse(["-m", "openai/m"]);
    const settled = await resumeOptions(command, options, dir);

    expect(settled.options).toBe(options);
    expect(settled.argv).toStrictEqual(process.argv.slice(2));
  });

  it("replays the run's options, display flags from the resume", async () => {
    expect(await resume(["--resume", "run-1", "-u"])).toStrictEqual({
      argv: ["-m", "openai/m", "-r", "2", "-q"],
      options: {
        model: ["openai/m"],
        repeat: "2",
        save: true,
        resume: "run-1",
        quiet: undefined,
        usage: true,
      },
    });
  });

  it("adds rounds", async () => {
    const settled = await resume(["--resume", "run-1", "-r", "5"]);

    expect(settled.options.repeat).toBe("5");
  });

  it("refuses fewer rounds than the run had", async () => {
    await expect(resume(["--resume", "run-1", "-r", "1"])).rejects.toThrow(
      "-r can't go below the run's own 2 round(s) when resuming",
    );
  });

  it("refuses any other flag, a default-on negation included", async () => {
    await expect(
      resume(["--resume", "run-1", "-m", "openai/x", "--no-save"]),
    ).rejects.toThrow(
      "--resume replays the run's own options and only takes -r, -q and -u (got --model, --no-save)",
    );
  });

  it("refuses a run with no record", async () => {
    await expect(resume(["--resume", "run-2"])).rejects.toThrow(/No run\.json/);
  });
});
