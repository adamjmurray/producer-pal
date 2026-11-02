// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type assertWithLlmJudge } from "#evals/scenarios/assertions/llm-judge.ts";
import { type EvalScenario } from "#evals/scenarios/types.ts";
import { parseRejudgeArgs, runRejudge } from "../jev-rejudge.ts";
import { readSidecar } from "../jev-sidecar.ts";

const scenarios = (prompt = "Prompt A"): EvalScenario[] =>
  [
    { id: "a", assertions: [{ type: "llm_judge", prompt }] },
    { id: "plain", assertions: [] },
  ] as unknown as EvalScenario[];

const resultJson = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    scenarioId: "a",
    timestamp: "2026-10-29T00:00:00Z",
    result: "pass",
    turns: [
      {
        turnIndex: 0,
        userMessage: "hi",
        assistantResponse: "ok",
        toolCalls: [],
      },
    ],
    checks: {
      pass: true,
      results: [{ type: "t", label: "L", pass: true, message: "m" }],
    },
    ...over,
  });

type Judge = typeof assertWithLlmJudge;

/** Fails results whose reply is "bad"; the rest pass. */
const fakeJudge = (): ReturnType<typeof vi.fn<Judge>> =>
  vi.fn<Judge>(async (assertion, turns, _default, override) => {
    const pass = turns[0]?.assistantResponse !== "bad";

    return {
      assertion,
      earned: 0,
      maxScore: 0,
      message: pass ? "LLM judge: pass" : "LLM judge: fail (1 issue(s))",
      details: {
        pass,
        issues: pass ? [] : ["bad reply"],
        provider: override?.provider,
        model: `${override?.model}-resolved`,
      },
    };
  });

describe("runRejudge", () => {
  let dir: string;
  const log = vi.fn();
  const base = (): string[] => [
    "run1",
    "-j",
    "codex-code/luna",
    `--results-dir=${dir}`,
  ];
  const deps = (judge: Judge, prompt?: string) => ({
    judge,
    log,
    now: () => new Date("2026-10-29T12:00:00Z"),
    load: { scenarios: scenarios(prompt), criteriaDate: () => undefined },
  });
  const turns = (reply: string): unknown[] => [
    {
      turnIndex: 0,
      userMessage: "hi",
      assistantResponse: reply,
      toolCalls: [],
    },
  ];

  beforeEach(async () => {
    log.mockClear();
    dir = await mkdtemp(join(tmpdir(), "jev-rejudge-"));
    await mkdir(join(dir, "run1"));
    await writeFile(join(dir, "run1", "a1.json"), resultJson());
    await writeFile(
      join(dir, "run1", "a2.json"),
      resultJson({ turns: turns("bad") }),
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("judges with the production judge and writes one sidecar per result", async () => {
    const judge = fakeJudge();
    const summary = await runRejudge(base(), deps(judge));

    expect(summary).toStrictEqual(
      expect.objectContaining({
        slug: "codex-code_luna",
        judged: 2,
        passed: 1,
        failed: 1,
      }),
    );
    expect(judge).toHaveBeenCalledTimes(2);

    const [assertion, , provider, override, checks] = judge.mock.calls[0] ?? [];

    expect(assertion).toStrictEqual({ type: "llm_judge", prompt: "Prompt A" });
    expect(provider).toBe("codex-code");
    expect(override).toStrictEqual(
      expect.objectContaining({ provider: "codex-code", model: "luna" }),
    );
    expect(checks).toStrictEqual([
      { type: "t", label: "L", pass: true, message: "m" },
    ]);

    const fail = await readSidecar(
      dir,
      join("run1", "a2.json"),
      "codex-code_luna",
      "Prompt A",
    );

    expect(fail).toStrictEqual(
      expect.objectContaining({
        scenarioId: "a",
        pass: false,
        issues: ["bad reply"],
        checksPass: true,
        judgedAt: "2026-10-29T12:00:00.000Z",
        judge: {
          provider: "codex-code",
          requestedModel: "luna",
          model: "luna-resolved",
        },
      }),
    );
    expect(fail?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("re-judges results from a --jev run, whoever decided them", async () => {
    const jev = {
      route: "typesafe",
      verdict: "pass",
      model: "jev-1",
      minProbability: 0.9,
      questions: [],
      outcome: { score: 3, level: "complete success", confidence: 0.9 },
      inputTokens: 1,
      outputTokens: 1,
      truncated: false,
    };

    await writeFile(
      join(dir, "run1", "j1.json"),
      resultJson({
        version: 2,
        judge: {
          pass: true,
          issues: [],
          provider: "jev",
          model: "jev-1",
          decidedBy: "jev",
          jev,
        },
      }),
    );
    await writeFile(
      join(dir, "run1", "j2.json"),
      resultJson({
        version: 2,
        turns: turns("bad"),
        judge: {
          pass: true,
          issues: [],
          decidedBy: "llm",
          jev: { ...jev, verdict: "escalate" },
          llm: { pass: true, issues: [] },
        },
      }),
    );

    const summary = await runRejudge(base(), deps(fakeJudge()));
    const j2 = await readSidecar(
      dir,
      join("run1", "j2.json"),
      "codex-code_luna",
      "Prompt A",
    );

    expect(summary.judged).toBe(4);
    expect(j2?.pass).toBe(false);
  });

  it("never changes the saved result", async () => {
    const before = await readFile(join(dir, "run1", "a1.json"), "utf8");

    await runRejudge(base(), deps(fakeJudge()));

    expect(await readFile(join(dir, "run1", "a1.json"), "utf8")).toBe(before);
  });

  it("skips results already judged, so a re-run makes no calls", async () => {
    await runRejudge(base(), deps(fakeJudge()));

    const again = fakeJudge();
    const summary = await runRejudge(base(), deps(again));

    expect(again).not.toHaveBeenCalled();
    expect(summary).toStrictEqual(
      expect.objectContaining({ alreadyJudged: 2, judged: 0 }),
    );
  });

  it("judges again with --force", async () => {
    await runRejudge(base(), deps(fakeJudge()));

    const again = fakeJudge();

    await runRejudge([...base(), "--force"], deps(again));

    expect(again).toHaveBeenCalledTimes(2);
  });

  it("judges again when the criteria changed", async () => {
    await runRejudge(base(), deps(fakeJudge()));

    const again = fakeJudge();

    await runRejudge(base(), deps(again, "Prompt A, reworded"));

    expect(again).toHaveBeenCalledTimes(2);
  });

  it("keeps one judge's sidecars apart from another's", async () => {
    await runRejudge(base(), deps(fakeJudge()));

    const other = fakeJudge();

    await runRejudge(
      ["run1", "-j", "anthropic/claude-haiku-5-5", `--results-dir=${dir}`],
      deps(other),
    );

    expect(other).toHaveBeenCalledTimes(2);
  });

  it("does not save a judge error, so the next run retries it", async () => {
    const failing = vi.fn<Judge>(async (assertion) => ({
      assertion,
      earned: 0,
      maxScore: 0,
      message: "LLM judge error: timeout",
      details: { pass: false, issues: ["timeout"] },
    }));
    const summary = await runRejudge(base(), deps(failing));

    expect(summary).toStrictEqual(
      expect.objectContaining({ judged: 0, errors: 2 }),
    );

    const retry = fakeJudge();

    await runRejudge(base(), deps(retry));

    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("counts a throwing judge as an error", async () => {
    const throwing = vi.fn<Judge>(async () => {
      throw new Error("boom");
    });

    expect(await runRejudge(base(), deps(throwing))).toStrictEqual(
      expect.objectContaining({ errors: 2 }),
    );
  });

  it("judges only gating-passed results unless told otherwise", async () => {
    await writeFile(
      join(dir, "run1", "c1.json"),
      resultJson({ result: "fail", checks: { pass: false, results: [] } }),
    );

    const judge = fakeJudge();

    expect(await runRejudge(base(), deps(judge))).toStrictEqual(
      expect.objectContaining({ eligible: 2, judged: 2 }),
    );

    const all = fakeJudge();

    expect(
      await runRejudge(
        [...base(), "--include-failed-checks", "--force"],
        deps(all),
      ),
    ).toStrictEqual(
      expect.objectContaining({
        eligible: 3,
        judged: 3,
      }),
    );
  });

  it("leaves out skipped, errored, empty, other-scenario and stale results", async () => {
    await writeFile(
      join(dir, "run1", "s1.json"),
      resultJson({ result: "skipped" }),
    );
    await writeFile(
      join(dir, "run1", "e1.json"),
      resultJson({ result: "error" }),
    );
    await writeFile(
      join(dir, "run1", "n1.json"),
      resultJson({ scenarioId: "plain" }),
    );
    await writeFile(join(dir, "run1", "t1.json"), resultJson({ turns: [] }));
    await writeFile(
      join(dir, "run1", "o1.json"),
      resultJson({ timestamp: "2026-01-01T00:00:00Z" }),
    );

    const summary = await runRejudge(base(), {
      ...deps(fakeJudge()),
      load: {
        scenarios: scenarios(),
        criteriaDate: () => "2026-06-01T00:00:00Z",
      },
    });

    expect(summary).toStrictEqual(
      expect.objectContaining({ loaded: 3, eligible: 2, judged: 2 }),
    );
    expect(log.mock.calls.flat().join("\n")).toContain("1 stale criteria");
  });

  it("keeps stale results with --include-stale", async () => {
    await writeFile(
      join(dir, "run1", "o1.json"),
      resultJson({ timestamp: "2026-01-01T00:00:00Z" }),
    );

    const summary = await runRejudge([...base(), "--include-stale"], {
      ...deps(fakeJudge()),
      load: {
        scenarios: scenarios(),
        criteriaDate: () => "2026-06-01T00:00:00Z",
      },
    });

    expect(summary.judged).toBe(3);
  });

  it("filters by scenario and limits per run, then continues on the next", async () => {
    await writeFile(
      join(dir, "run1", "z1.json"),
      resultJson({ scenarioId: "plain" }),
    );

    const judge = fakeJudge();
    const first = await runRejudge(
      [...base(), "--scenario=a", "--limit=1"],
      deps(judge),
    );

    expect(first.judged).toBe(1);

    const second = await runRejudge(
      [...base(), "--scenario=a", "--limit=1"],
      deps(judge),
    );

    expect(second).toStrictEqual(
      expect.objectContaining({ judged: 1, alreadyJudged: 1 }),
    );
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("makes no calls and writes nothing on --dry-run", async () => {
    const judge = fakeJudge();
    const summary = await runRejudge([...base(), "--dry-run"], deps(judge));

    expect(judge).not.toHaveBeenCalled();
    expect(summary).toStrictEqual(
      expect.objectContaining({ eligible: 2, judged: 0 }),
    );
    expect(
      await readSidecar(
        dir,
        join("run1", "a1.json"),
        "codex-code_luna",
        "Prompt A",
      ),
    ).toBeUndefined();
  });

  describe("--sample", () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await writeFile(join(dir, "run1", `p${i}.json`), resultJson());
      }

      await writeFile(
        join(dir, "run1", "f1.json"),
        resultJson({ result: "fail" }),
      );
    });

    const judgedFiles = async (): Promise<string[]> => {
      const names = [
        "a1",
        "a2",
        "f1",
        ...Array.from({ length: 10 }, (_, i) => `p${i}`),
      ];
      const found = [];

      for (const name of names) {
        const v = await readSidecar(
          dir,
          join("run1", `${name}.json`),
          "codex-code_luna",
          "Prompt A",
        );

        if (v != null) {
          found.push(name);
        }
      }

      return found;
    };

    it("keeps the stored fails and N passes, the same ones for the same seed", async () => {
      const dry = await runRejudge(
        [...base(), "--sample=fails+3", "--seed=5", "--dry-run"],
        deps(fakeJudge()),
      );

      // f1 is the only stored fail (a2's reply is "bad", but its result passed)
      expect(dry).toStrictEqual(
        expect.objectContaining({ eligible: 13, sampled: 4 }),
      );

      await runRejudge(
        [...base(), "--sample=fails+3", "--seed=5"],
        deps(fakeJudge()),
      );

      const first = await judgedFiles();

      await rm(join(dir, "run1", "judges"), { recursive: true });
      await runRejudge(
        [...base(), "--sample=fails+3", "--seed=5"],
        deps(fakeJudge()),
      );

      expect(first).toHaveLength(4);
      expect(first).toContain("f1");
      expect(await judgedFiles()).toStrictEqual(first);
    });

    it("also counts results another sidecar judge failed as fails", async () => {
      await runRejudge(
        ["run1", "-j", "anthropic/claude-haiku-5-5", `--results-dir=${dir}`],
        deps(fakeJudge()),
      );

      const summary = await runRejudge(
        [
          ...base(),
          "--sample=fails+0",
          "--fails-from=anthropic/claude-haiku-5-5",
          "--dry-run",
        ],
        deps(fakeJudge()),
      );

      // haiku failed a2 (reply "bad"); f1 is a stored fail
      expect(summary.sampled).toBe(2);
    });
  });
});

describe("parseRejudgeArgs", () => {
  it("reads the judge from -j, --judge and --judge=", () => {
    expect(parseRejudgeArgs(["-j", "a/b"]).judge).toBe("a/b");
    expect(parseRejudgeArgs(["--judge", "a/b"]).judge).toBe("a/b");
    expect(parseRejudgeArgs(["--judge=a/b"]).judge).toBe("a/b");
  });

  it("requires a judge", () => {
    expect(() => parseRejudgeArgs(["run1"])).toThrow("Missing -j/--judge");
    expect(() => parseRejudgeArgs(["-j"])).toThrow("Missing -j/--judge");
  });

  it("treats other words as run ids, accepting a directory path", () => {
    expect(
      parseRejudgeArgs(["r1", "evals/results/r2/", "-j", "a/b"]).runIds,
    ).toStrictEqual(["r1", "r2"]);
    expect(parseRejudgeArgs(["-j", "a/b"]).runIds).toBeUndefined();
  });

  it("has defaults", () => {
    expect(parseRejudgeArgs(["-j", "a/b"])).toStrictEqual({
      runIds: undefined,
      judge: "a/b",
      scenarioIds: [],
      limit: undefined,
      concurrency: 4,
      samplePasses: undefined,
      seed: 1,
      failsFrom: [],
      includeFailedChecks: false,
      includeStale: false,
      force: false,
      dryRun: false,
      resultsDir: "evals/results",
    });
  });

  it("reads every flag", () => {
    expect(
      parseRejudgeArgs([
        "-j",
        "a/b",
        "--scenario=x",
        "--scenario=y",
        "--limit=3",
        "--concurrency=2",
        "--sample=fails+7",
        "--seed=9",
        "--fails-from=h",
        "--fails-from=l",
        "--include-failed-checks",
        "--include-stale",
        "--force",
        "--dry-run",
        "--results-dir=/r",
      ]),
    ).toStrictEqual(
      expect.objectContaining({
        scenarioIds: ["x", "y"],
        limit: 3,
        concurrency: 2,
        samplePasses: 7,
        seed: 9,
        failsFrom: ["h", "l"],
        includeFailedChecks: true,
        includeStale: true,
        force: true,
        dryRun: true,
        resultsDir: "/r",
      }),
    );
  });
});
