// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { getDefaultModel } from "#evals/scenarios/eval-session.ts";
import { resolveJudgeModel } from "./judge.ts";

describe("resolveJudgeModel", () => {
  it("prefers the explicit model", () => {
    expect(resolveJudgeModel("google", "m")).toBe("m");
    expect(resolveJudgeModel("codex-code", "m")).toBe("m");
  });

  it("uses the provider default for AI SDK providers", () => {
    expect(resolveJudgeModel("google", undefined)).toBe(
      getDefaultModel("google"),
    );
  });

  it("uses the isolated judge model for agent CLIs", () => {
    expect(resolveJudgeModel("codex-code", undefined)).toBe(
      getAgentCliTransport("codex-code")?.judgeModel,
    );
  });
});
