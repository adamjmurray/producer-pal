// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setConfig } from "#evals/shared/config.ts";
import { createEvalSession, type EvalSession } from "../eval-session.ts";
import { type RunEnv } from "../run-env/run-env.ts";
import { runScenario } from "../run-scenario.ts";
import {
  fetchLocalModelInfo,
  type LocalModelInfo,
} from "./local-model/local-model-info.ts";
import { runAllAssertions } from "../helpers/scenario-sections.ts";
import { type EvalProvider, type EvalScenario } from "../types.ts";

vi.mock(import("#evals/shared/config.ts"), () => ({
  setConfig: vi.fn(),
  resetConfig: vi.fn(),
}));
vi.mock(import("../eval-session.ts"), () => ({
  createEvalSession: vi.fn(),
  getDefaultModel: vi.fn(() => "default-model"),
}));
vi.mock(import("../helpers/scenario-sections.ts"), () => ({
  runAllAssertions: vi.fn(),
}));
vi.mock(import("./clear-project-context-backup.ts"), () => ({
  clearProjectContextBackup: vi.fn(),
}));
vi.mock(import("./local-model/local-model-info.ts"), () => ({
  fetchLocalModelInfo: vi.fn(),
}));

const BUILD: LocalModelInfo = { variant: "qwen3.8:latest", quantization: "Q4" };
const SCENARIO = {
  id: "s",
  description: "d",
  liveSet: "test",
  messages: ["one"],
  assertions: [],
} as unknown as EvalScenario;

/**
 * Run the scenario with skipLiveSetOpen against a session whose one turn
 * returns the given reply.
 *
 * @param provider - Provider the run uses
 * @param error - Turn error the model server returns, if any
 * @returns The scenario result
 */
function run(provider: EvalProvider, error?: string) {
  vi.mocked(createEvalSession).mockResolvedValue({
    sendMessage: vi.fn().mockResolvedValue({ text: "", toolCalls: [], error }),
    close: vi.fn(),
  } as unknown as EvalSession);

  return runScenario(SCENARIO, {
    provider,
    skipLiveSetOpen: true,
    runEnv: {} as RunEnv,
    envLabel: "default",
  });
}

describe("runScenario local model build", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(setConfig).mockResolvedValue(undefined);
    vi.mocked(runAllAssertions).mockResolvedValue([]);
    vi.mocked(fetchLocalModelInfo).mockReset();
    vi.mocked(fetchLocalModelInfo).mockResolvedValue(BUILD);
  });

  it("records the build of a run that finished", async () => {
    const result = await run("local");

    expect(result.error).toBeUndefined();
    expect(result.localModel).toStrictEqual(BUILD);
  });

  it("records the build of a run that errored", async () => {
    const result = await run("local", "Cannot connect to API: socket hang up");

    expect(result.error).toContain("Cannot connect to API");
    expect(result.localModel).toStrictEqual(BUILD);
    expect(fetchLocalModelInfo).toHaveBeenCalledWith("default-model");
  });

  it("keeps the run's own error when the build lookup throws", async () => {
    vi.mocked(fetchLocalModelInfo).mockRejectedValue(new Error("lookup died"));

    const result = await run("local", "Cannot connect to API: socket hang up");

    expect(result.error).toContain("Cannot connect to API");
    expect(result).not.toHaveProperty("localModel");
  });

  it("looks up no build for a hosted provider", async () => {
    const result = await run("openai", "Bad gateway (HTTP 502)");

    expect(fetchLocalModelInfo).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("localModel");
  });
});
