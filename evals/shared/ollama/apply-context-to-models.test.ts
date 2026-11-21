// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyContextOrExit,
  applyContextToModels,
} from "./apply-context-to-models.ts";
import { ensureOllamaContextModel } from "./ollama-context-model.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";

vi.mock(import("./ollama-context-model.ts"), () => ({
  ensureOllamaContextModel: vi.fn(
    async (model: string, numCtx: number) => `${model}-ctx${numCtx}`,
  ),
}));

const BASE = "http://localhost:11434/v1";
const LOCAL_A: ModelSpec = { provider: "local", model: "lfm2.5" };
const LOCAL_B: ModelSpec = { provider: "local", model: "qwen3.8:q4" };
const GEMINI: ModelSpec = { provider: "google", model: "gemini-3.8-flash" };

describe("applyContextToModels", () => {
  beforeEach(() => {
    vi.mocked(ensureOllamaContextModel).mockClear();
  });

  it("renames local models and leaves the others", async () => {
    await expect(
      applyContextToModels([GEMINI, LOCAL_A, LOCAL_B], 65536, BASE),
    ).resolves.toStrictEqual([
      GEMINI,
      { provider: "local", model: "lfm2.5-ctx65536" },
      { provider: "local", model: "qwen3.8:q4-ctx65536" },
    ]);
    expect(ensureOllamaContextModel).toHaveBeenCalledWith(
      "lfm2.5",
      65536,
      BASE,
    );
  });

  it("creates one copy for a model listed twice", async () => {
    await applyContextToModels([LOCAL_A, LOCAL_A], 8192, BASE);

    expect(ensureOllamaContextModel).toHaveBeenCalledTimes(1);
  });

  it("surfaces the second model's failure after the first succeeded", async () => {
    vi.mocked(ensureOllamaContextModel)
      .mockResolvedValueOnce("lfm2.5-ctx1")
      .mockRejectedValueOnce(new Error("create failed"));

    await expect(
      applyContextToModels([LOCAL_A, LOCAL_B], 1, BASE),
    ).rejects.toThrow("create failed");
    expect(ensureOllamaContextModel).toHaveBeenCalledTimes(2);
  });

  it("refuses a run with no local model", async () => {
    await expect(applyContextToModels([GEMINI], 65536, BASE)).rejects.toThrow(
      "--context needs a local/... model; it only applies to local models.",
    );
    expect(ensureOllamaContextModel).not.toHaveBeenCalled();
  });
});

describe("applyContextOrExit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function quietProgram(): Command {
    return new Command().exitOverride().configureOutput({
      writeErr: () => undefined,
    });
  }

  it("uses LOCAL_BASE_URL when set, else the default", async () => {
    vi.stubEnv("LOCAL_BASE_URL", "http://box:1234/v1");
    await applyContextOrExit(quietProgram(), [LOCAL_A], 4096);

    expect(ensureOllamaContextModel).toHaveBeenLastCalledWith(
      "lfm2.5",
      4096,
      "http://box:1234/v1",
    );

    vi.stubEnv("LOCAL_BASE_URL", undefined);
    await applyContextOrExit(quietProgram(), [LOCAL_A], 4096);

    expect(ensureOllamaContextModel).toHaveBeenLastCalledWith(
      "lfm2.5",
      4096,
      BASE,
    );
  });

  it("surfaces an error from creating the copy as a usage error", async () => {
    vi.mocked(ensureOllamaContextModel).mockRejectedValueOnce(
      new Error('Model "lfm2.5" not found'),
    );

    await expect(
      applyContextOrExit(quietProgram(), [LOCAL_A], 4096),
    ).rejects.toThrow('Model "lfm2.5" not found');
  });

  it("reports a failure as a usage error", async () => {
    await expect(
      applyContextOrExit(quietProgram(), [GEMINI], 4096),
    ).rejects.toThrow("--context needs a local/... model");
  });
});
