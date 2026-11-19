// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { StepUsageLabel } from "#webui/components/chat/assistant/StepUsageLabel";
import { type TokenUsage } from "#webui/chat/sdk/types";
import { formatStepTiming } from "#webui/components/chat/assistant/helpers/step-usage";

describe("StepUsageLabel", () => {
  it("falls back to 0 for every absent token field", () => {
    // Empty usage exercises the `?? 0` fallback on inputTokens, outputTokens,
    // cacheReadTokens and reasoningTokens (their nullish branches).
    const { container } = render(<StepUsageLabel usage={{}} />);

    // "tokens: 0 → 0" — no (new), (cached) or (reasoning) segments.
    expect(container.textContent).toContain("tokens:");
    expect(container.textContent).not.toContain("new");
    expect(container.textContent).not.toContain("cached");
    expect(container.textContent).not.toContain("reasoning");
    expect(container.textContent).not.toContain("tok/s");
  });

  it("appends generation speed when the step was timed", () => {
    const { container } = render(
      <StepUsageLabel
        usage={{ inputTokens: 6078, outputTokens: 33 }}
        timing={{ timeToFirstTokenMs: 1200, outputTokensPerSecond: 42.4 }}
      />,
    );

    expect(container.textContent).toContain("· 42 tok/s · 1.2s to first token");
  });
});

describe("formatStepTiming", () => {
  it("returns an empty string when there is no timing", () => {
    expect(formatStepTiming(undefined)).toBe("");
  });

  it("uses milliseconds below a second", () => {
    expect(formatStepTiming({ timeToFirstTokenMs: 840.6 })).toBe(
      " · 841ms to first token",
    );
  });

  it("omits the first-token time when it was not measured", () => {
    expect(formatStepTiming({ outputTokensPerSecond: 7.5 })).toBe(" · 8 tok/s");
  });
});

describe("StepUsageLabel new content", () => {
  it("counts what the step added beyond the previous one", () => {
    const { container } = render(
      <StepUsageLabel
        usage={{ inputTokens: 1500, outputTokens: 10 }}
        prevUsage={{ inputTokens: 1000, outputTokens: 200 }}
      />,
    );

    expect(container.textContent).toContain("tokens: 1.5K (300 new)");
  });
});

describe("StepUsageLabel context use", () => {
  const step = (inputTokens: number, contextLength?: number): TokenUsage => ({
    inputTokens,
    outputTokens: 10,
    ...(contextLength != null && { contextLength }),
  });

  function renderStep(usage: TokenUsage, prevUsage?: TokenUsage) {
    return render(<StepUsageLabel usage={usage} prevUsage={prevUsage} />)
      .container;
  }

  it("shows no context use when the window size is unknown", () => {
    expect(renderStep(step(5000)).textContent).not.toContain("context");
  });

  it.each([
    [6900, "context: 69%", ""],
    [7000, "context: 70%", "text-amber-600 dark:text-amber-400"],
    [8900, "context: 89%", "text-amber-600 dark:text-amber-400"],
  ])("shows %i of 10K as %s", (input, text, colour) => {
    const container = renderStep(step(input, 10_000));
    const span = [...container.querySelectorAll("span")].find(
      (el) => el.textContent === text,
    );

    expect(span?.className).toBe(colour);
    expect(container.textContent).not.toContain("Compact");
  });

  it("turns red and points at compaction from 90%", () => {
    const container = renderStep(step(9000, 10_000));

    expect(container.querySelector(".text-red-600")?.textContent).toBe(
      "context: 90%",
    );
    expect(container.textContent).toContain(
      "The model's context is almost full. Compact the conversation (🗜) to free space.",
    );
  });

  it("counts the step's output as well as its input", () => {
    const container = renderStep({
      inputTokens: 8500,
      outputTokens: 1400,
      contextLength: 10_000,
    });

    expect(container.querySelector(".text-red-600")?.textContent).toBe(
      "context: 99%",
    );
    expect(container.textContent).toContain("almost full");
  });

  it("counts the input alone when the output is unknown", () => {
    const container = renderStep({ inputTokens: 7000, contextLength: 10_000 });

    expect(container.textContent).toContain("context: 70%");
  });

  it.each([
    ["stalls", 4000],
    ["drops", 3500],
  ])("warns of cut history when the input %s", (_name, input) => {
    const container = renderStep(step(input, 10_000), step(4000, 10_000));

    expect(container.textContent).toContain(
      "The model may have dropped earlier messages to fit its context.",
    );
  });

  it("doesn't warn while the input grows", () => {
    const container = renderStep(step(4001, 10_000), step(4000, 10_000));

    expect(container.textContent).not.toContain("dropped");
  });

  it("doesn't compare with a step whose window size is unknown", () => {
    const container = renderStep(step(3000, 10_000), step(4000));

    expect(container.textContent).not.toContain("dropped");
  });
});
