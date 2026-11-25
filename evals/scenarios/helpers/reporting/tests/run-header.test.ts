// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printRunHeader, type RunHeader } from "../run-header.ts";

const BASE: RunHeader = {
  scenarioCount: 2,
  modelSpecs: [{ provider: "google", model: "gemini-3.8-flash" }],
  repeatCount: 1,
  label: "default",
  thinking: new Map(),
  judgeOverride: { provider: "codex-code", model: "luna" },
  deciderIgnored: false,
};

describe("printRunHeader", () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints only the run count when nothing else is set", () => {
    printRunHeader(BASE);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Running 2 scenario(s) × 1 model(s) = 2 run(s)");
  });

  it("prints each setting in use", () => {
    printRunHeader({
      ...BASE,
      repeatCount: 3,
      label: "compact",
      modelSpecs: [
        { provider: "google", model: "gemini-3.8-flash" },
        { provider: "local", model: "lfm2.5-ctx65536" },
      ],
      context: 65536,
      thinking: new Map([["google/gemini-3.8-flash", "high"]]),
      judgeOverride: { ...BASE.judgeOverride, thinking: "low" },
      decider: { provider: "openai", model: "jev" } as RunHeader["decider"],
    });

    const text = lines.join("\n");

    expect(text).toContain("× 3 trial(s) = 12 run(s)");
    expect(text).toContain("Environment: compact");
    expect(text).toContain("Context: 65536 tokens (lfm2.5-ctx65536)");
    expect(text).toContain("Thinking: google/gemini-3.8-flash=high");
    expect(text).toContain("Judge thinking: low");
    expect(text).toContain("Judge: decider openai/jev first");
  });

  it("says when --skip-judge turns the decider off", () => {
    printRunHeader({ ...BASE, deciderIgnored: true });

    expect(lines.join("\n")).toContain("--skip-judge: the decider is not used");
  });
});
