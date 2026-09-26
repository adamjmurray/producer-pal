// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { StepUsageLabel } from "#webui/components/chat/assistant/StepUsageLabel";
import {
  calcStepNewContent,
  formatStepTiming,
} from "#webui/components/chat/assistant/helpers/step-usage";

describe("StepUsageLabel", () => {
  it("falls back to 0 for every absent token field", () => {
    // Empty usage exercises the `?? 0` fallback on inputTokens, outputTokens,
    // cacheReadTokens and reasoningTokens (their nullish branches).
    const { container } = render(
      <StepUsageLabel usage={{}} newContentTokens={null} />,
    );

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
        newContentTokens={null}
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

describe("calcStepNewContent", () => {
  it("returns null and defaults input to 0 when the part has no prev usage", () => {
    // Empty map → no prev; empty usage → inputTokens falls back to 0.
    expect(calcStepNewContent(0, {}, new Map())).toBeNull();
  });
});
